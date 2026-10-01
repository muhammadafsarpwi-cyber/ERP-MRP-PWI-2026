import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Button, Select, DatePicker, Table, Tag,
  Tooltip, message, Input, Spin, Modal,
} from 'antd';
import {
  PieChartOutlined, PrinterOutlined, FileExcelOutlined,
  CalendarOutlined, SearchOutlined, MailOutlined,
  FilePdfOutlined, RiseOutlined, FallOutlined, DollarOutlined,
  ShoppingOutlined, AppstoreOutlined,
  ClockCircleOutlined, SyncOutlined, ToolOutlined,
  UserOutlined, TeamOutlined, BankOutlined, BarChartOutlined,
  LineChartOutlined, ApartmentOutlined, BranchesOutlined,
  ProjectOutlined, RocketOutlined, SafetyCertificateOutlined,
  ReloadOutlined, SettingOutlined, ArrowUpOutlined, ArrowDownOutlined,
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, PlusCircleOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import { formatDecimal } from '../../utils/numberFormat';
import './GeneralReports.css';

// ==========================================
// TYPES & DATA DEFINITIONS
// ==========================================

export type ReportCategoryKey =
  | 'production'
  | 'sales'
  | 'receivables'
  | 'purchases'
  | 'inventory'
  | 'finance';

export type ReportId =
  // Production MRP
  | 'prod_daily'
  | 'prod_machine'
  | 'prod_shift'
  | 'prod_operator'
  | 'prod_department'
  | 'prod_target_vs_actual'
  | 'prod_scrap'
  // Sales
  | 'sales_overview'
  | 'sales_product'
  | 'sales_customer'
  | 'sales_bill_profit'
  | 'sales_party_pl'
  | 'sales_category'
  | 'sales_hsn'
  | 'sales_party_groups'
  // Receivables & Payables
  | 'rec_aging'
  | 'pay_aging'
  | 'supplier_statement'
  | 'payments_ledger'
  // Purchases & Expenses
  | 'purchases'
  | 'expenses'
  // Inventory
  | 'inv_stock'
  | 'inv_valuation'
  | 'inv_movement'
  | 'inv_batches'
  // Finance
  | 'fin_pl'
  | 'fin_balance'
  | 'fin_cashflow'
  | 'fin_daybook';

export type TimeframePreset = 'all' | 'today' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'custom';

export type ChartType = 'horizontal' | 'column' | 'donut' | 'efficiency';

// Real Production Row structure mapped from backend & Supabase table `production_entries`
export interface RealProductionEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  machineNo: string;
  machineName: string;
  shiftName: string;
  operatorName: string;
  supervisorName: string;
  departmentName: string;
  divisionId: string;
  divisionName: string;
  itemCode: string;
  itemName: string;
  coilSize?: string;
  targetQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  scrapQuantity: number;
  efficiencyPercent: number;
  runningHours: number;
  downtimeHours: number;
  status: 'Completed' | 'On Track' | 'Delayed';
  remarks?: string;
}

// Real Sales Invoice structure mapped from Supabase `erp_sales.sales_invoices`
export interface RealSalesInvoice {
  id: string;
  invoiceNo: string;
  customerName: string;
  customerCode?: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: 'Paid' | 'Pending' | 'Partial' | 'Draft';
}

export interface BarChartItem {
  id: string;
  label: string;
  value: number;
  target?: number;
  unit?: string;
  displayValue: string;
  sublabel?: string;
  color: string;
  percentage: number;
  efficiency?: number;
}

export interface MasterMachineDef {
  machineNo: string;
  machineName: string;
  department: string;
  divisionName: string;
  unit: string;
  standardCapacityPerShift: number;
}

// Canonical Process Sequence Step Definition
export interface PipelineStep {
  id: string;
  order: number;
  name: string;
  subtext?: string;
  departmentKey?: string;
  unit?: string;
  isStandardStep?: boolean;
}

// Factory Standard Process Sequences per Plant Division
export const DEFAULT_DIVISION_PIPELINES: Record<string, PipelineStep[]> = {
  // 1. Control Cable Division
  control_cable: [
    { id: 'cc-flat', order: 1, name: 'Flattening', subtext: 'FT-01 to FT-05 (kg)', departmentKey: 'Flattening', unit: 'kg' },
    { id: 'cc-spir', order: 2, name: 'Spiral', subtext: 'SP-01 to SP-14 (Mtr)', departmentKey: 'Spiral', unit: 'Mtr' },
    { id: 'cc-pvc', order: 3, name: 'PVC', subtext: 'PVC-01 & PV-01 (Mtr)', departmentKey: 'PVC', unit: 'Mtr' },
    { id: 'cc-cut-pk', order: 4, name: 'Cutting & Packing', subtext: 'CPK Lines (Coils)', departmentKey: 'Cutting & Packing', unit: 'Coils' },
    { id: 'cc-pack', order: 5, name: 'Packing', subtext: 'Assembly & Boxing (Coils)', departmentKey: 'Packing', unit: 'Coils' },
    { id: 'cc-disp', order: 6, name: 'CCD Dispatch', subtext: 'Finished Goods Outflow', departmentKey: 'CCD Dispatch', isStandardStep: true },
  ],
  // 2. Spoke Division (All Real Database Departments)
  spoke: [
    { id: 'spk-st', order: 1, name: 'Straightener', subtext: 'ST-01 to ST-02 (Pcs)', departmentKey: 'Straightener', unit: 'Pcs' },
    { id: 'spk-sw', order: 2, name: 'Swagging', subtext: 'SW-01 to SW-02 (Pcs)', departmentKey: 'Swagging', unit: 'Pcs' },
    { id: 'spk-spk', order: 3, name: 'Spoke', subtext: 'Heading & Threading (Pcs)', departmentKey: 'Spoke', unit: 'Pcs' },
    { id: 'spk-hdr', order: 4, name: 'Header', subtext: 'Header Heading Lines (Pcs)', departmentKey: 'Header', unit: 'Pcs' },
    { id: 'spk-nip', order: 5, name: 'Nipple', subtext: 'Nipple Production (Pcs)', departmentKey: 'Nipple', unit: 'Pcs' },
    { id: 'spk-plt', order: 6, name: 'Spoke Plating', subtext: 'Zinc & Chrome Plating (Pcs)', departmentKey: 'Spoke Plating', unit: 'Pcs' },
    { id: 'spk-nip-plt', order: 7, name: 'Nipple Plating', subtext: 'Surface Treatment (Pcs)', departmentKey: 'Nipple Plating', unit: 'Pcs' },
    { id: 'spk-pk', order: 8, name: 'Spoke Packing', subtext: 'Box Packaging (Gross / 144 Pcs)', departmentKey: 'Spoke Packing', unit: 'Gross (144 Pcs)' },
  ],
  // 3. Fallback General Division
  default: [
    { id: 'gen-prod', order: 1, name: 'Production', subtext: 'Primary Lines', departmentKey: 'Production', unit: 'Qty' },
    { id: 'gen-qual', order: 2, name: 'Quality Inspection', subtext: 'QC & Testing', departmentKey: 'Quality', unit: 'Qty' },
    { id: 'gen-pack', order: 3, name: 'Packing', subtext: 'Packaging Lines', departmentKey: 'Packing', unit: 'Boxes' },
  ],
};

export const getDivisionPipelineKey = (divisionIdOrName: string): string => {
  const s = (divisionIdOrName || '').toLowerCase();
  if (s === 'd1000000-0000-0000-0000-000000000002' || s.includes('control cable')) return 'control_cable';
  if (s === 'd1000000-0000-0000-0000-000000000001' || s.includes('spoke')) return 'spoke';
  return 'default';
};

// Canonical Database Departments Registry
export const SEEDED_DEPARTMENTS: Array<{ id: string; name: string; division_id?: string | null; divisionId?: string | null }> = [
  // Spoke Division (d1000000-0000-0000-0000-000000000001)
  { id: 'd3000000-0000-0000-0000-000000000001', name: 'Straightener', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000002', name: 'Swagging', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000003', name: 'Spoke', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000004', name: 'Header', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000005', name: 'Nipple', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000006', name: 'Spoke Plating', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000007', name: 'Nipple Plating', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000008', name: 'Spoke Packing', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000009', name: 'Facility Maintenance', division_id: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'f8312f0c-ba1e-401a-80cd-43d6b5cc8c05', name: 'SPI Stores', division_id: 'd1000000-0000-0000-0000-000000000001' },

  // Control Cable Division (d1000000-0000-0000-0000-000000000002)
  { id: 'd3000000-0000-0000-0000-000000000010', name: 'Flattening', division_id: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd3000000-0000-0000-0000-000000000011', name: 'Spiral', division_id: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd3000000-0000-0000-0000-000000000012', name: 'PVC', division_id: 'd1000000-0000-0000-0000-000000000002' },
  { id: '5676c09a-f334-43a8-8309-f43d99e01320', name: 'Cutting & Packing', division_id: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd3000000-0000-0000-0000-000000000013', name: 'Packing', division_id: 'd1000000-0000-0000-0000-000000000002' },
  { id: '4dec9c7a-daba-42c2-8502-71b2d2ed666c', name: 'CCD Dispatch', division_id: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd8cf64a6-ebfc-4a94-a807-4960d3166752', name: 'CCD Stores', division_id: 'd1000000-0000-0000-0000-000000000002' },
];

// Canonical Master Machines across plant divisions
export const MASTER_MACHINES: MasterMachineDef[] = [
  // 1. Flattening Department (Control Cable Division) - Unit: kg
  { machineNo: 'FL-01', machineName: 'Flattening Machine 01', department: 'Flattening', divisionName: 'Control Cable Division', unit: 'kg', standardCapacityPerShift: 1200 },
  { machineNo: 'FL-02', machineName: 'Flattening Machine 02', department: 'Flattening', divisionName: 'Control Cable Division', unit: 'kg', standardCapacityPerShift: 1200 },
  { machineNo: 'FT-01', machineName: 'Flattening Machine FT-01', department: 'Flattening', divisionName: 'Control Cable Division', unit: 'kg', standardCapacityPerShift: 1500 },
  { machineNo: 'FT-02', machineName: 'Flattening Machine FT-02', department: 'Flattening', divisionName: 'Control Cable Division', unit: 'kg', standardCapacityPerShift: 1500 },
  { machineNo: 'FT-03', machineName: 'Flattening Machine FT-03', department: 'Flattening', divisionName: 'Control Cable Division', unit: 'kg', standardCapacityPerShift: 1500 },
  { machineNo: 'FT-04', machineName: 'Flattening Machine FT-04', department: 'Flattening', divisionName: 'Control Cable Division', unit: 'kg', standardCapacityPerShift: 1500 },
  { machineNo: 'FT-05', machineName: 'Flattening Machine FT-05', department: 'Flattening', divisionName: 'Control Cable Division', unit: 'kg', standardCapacityPerShift: 1500 },

  // 2. Spiral Department (Control Cable Division) - Unit: Mtr (SP-01 to SP-14, SR-01 to SR-03)
  { machineNo: 'SP-01', machineName: 'Spiral Machine SP-01', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-02', machineName: 'Spiral Machine SP-02', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-03', machineName: 'Spiral Machine SP-03', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-04', machineName: 'Spiral Machine SP-04', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-05', machineName: 'Spiral Machine SP-05', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-06', machineName: 'Spiral Machine SP-06', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-07', machineName: 'Spiral Machine SP-07', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-08', machineName: 'Spiral Machine SP-08', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-09', machineName: 'Spiral Machine SP-09', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-10', machineName: 'Spiral Machine SP-10', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-11', machineName: 'Spiral Machine SP-11', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-12', machineName: 'Spiral Machine SP-12', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-13', machineName: 'Spiral Machine SP-13', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SP-14', machineName: 'Spiral Machine SP-14', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3000 },
  { machineNo: 'SR-01', machineName: 'Spiral Machine SR-01', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 2500 },
  { machineNo: 'SR-02', machineName: 'Spiral Machine SR-02', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 2500 },
  { machineNo: 'SR-03', machineName: 'Spiral Machine SR-03', department: 'Spiral', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 2500 },

  // 3. PVC Extrusion Department (Control Cable Division) - Unit: Mtr
  { machineNo: 'PV-01', machineName: 'PVC Coating Line 01', department: 'PVC', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3500 },
  { machineNo: 'PV-02', machineName: 'PVC Coating Line 02', department: 'PVC', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3500 },
  { machineNo: 'PVC-01', machineName: 'PVC Extrusion Machine 01', department: 'PVC', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 4000 },
  { machineNo: 'PVC-02', machineName: 'PVC Coating Line 02', department: 'PVC', divisionName: 'Control Cable Division', unit: 'Mtr', standardCapacityPerShift: 3500 },

  // 4. Cutting & Packing Department (Control Cable Division) - Unit: Coils
  { machineNo: 'CPK-01', machineName: 'CCD Packing Station 01', department: 'Cutting & Packing', divisionName: 'Control Cable Division', unit: 'Coils', standardCapacityPerShift: 1500 },
  { machineNo: 'PK-01', machineName: 'CCD Packing Station PK-01', department: 'Packing', divisionName: 'Control Cable Division', unit: 'Coils', standardCapacityPerShift: 1500 },
  { machineNo: 'PK-02', machineName: 'CCD Packing Station PK-02', department: 'Packing', divisionName: 'Control Cable Division', unit: 'Coils', standardCapacityPerShift: 1500 },

  // 5. Spoke Division Lines - Complete Real Plant Fleet
  // Straightener (ST-01 to ST-05) - Unit: Pcs
  { machineNo: 'ST-01', machineName: 'Straightener Machine ST-01', department: 'Straightener', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 60000 },
  { machineNo: 'ST-02', machineName: 'Straightener Machine ST-02', department: 'Straightener', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 74400 },
  { machineNo: 'ST-03', machineName: 'Straightener Machine ST-03', department: 'Straightener', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 60000 },
  { machineNo: 'ST-04', machineName: 'Straightener Machine ST-04', department: 'Straightener', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 60000 },
  { machineNo: 'ST-05', machineName: 'Straightener Machine ST-05', department: 'Straightener', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 60000 },

  // Swagging (SW-01 to SW-06) - Unit: Pcs
  { machineNo: 'SW-01', machineName: 'Swaging Machine SW-01', department: 'Swagging', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 40000 },
  { machineNo: 'SW-02', machineName: 'Swaging Machine SW-02', department: 'Swagging', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 40000 },
  { machineNo: 'SW-03', machineName: 'Swaging Machine SW-03', department: 'Swagging', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 40000 },
  { machineNo: 'SW-04', machineName: 'Swaging Machine SW-04', department: 'Swagging', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 40000 },
  { machineNo: 'SW-05', machineName: 'Swaging Machine SW-05', department: 'Swagging', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 40000 },
  { machineNo: 'SW-06', machineName: 'Swaging Machine SW-06', department: 'Swagging', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 40000 },

  // Spoke Heading & Threading (SPK-01 to SPK-07) - Unit: Pcs
  { machineNo: 'SPK-01', machineName: 'Spoke Heading & Threading 01', department: 'Spoke', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 35000 },
  { machineNo: 'SPK-02', machineName: 'Spoke Heading & Threading 02', department: 'Spoke', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 35000 },
  { machineNo: 'SPK-03', machineName: 'Spoke Machine SPK-03', department: 'Spoke', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 35000 },
  { machineNo: 'SPK-04', machineName: 'Spoke Machine SPK-04', department: 'Spoke', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 33600 },
  { machineNo: 'SPK-05', machineName: 'Spoke Machine SPK-05', department: 'Spoke', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 35000 },
  { machineNo: 'SPK-06', machineName: 'Spoke Machine SPK-06', department: 'Spoke', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 35000 },
  { machineNo: 'SPK-07', machineName: 'Spoke Machine SPK-07', department: 'Spoke', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 35000 },

  // Header Department (HD-01, HD-02) - Unit: Pcs
  { machineNo: 'HD-01', machineName: 'Header Machine HD-01', department: 'Header', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 50000 },
  { machineNo: 'HD-02', machineName: 'Header Machine HD-02', department: 'Header', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 50000 },

  // Nipple Department (NP-01, NP-02) - Unit: Pcs
  { machineNo: 'NP-01', machineName: 'Nipple Machine NP-01', department: 'Nipple', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 50000 },
  { machineNo: 'NP-02', machineName: 'Nipple Machine NP-02', department: 'Nipple', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 50000 },

  // Spoke Plating (APS-01, BL-01 to BL-09, SPL-01) - Unit: Pcs
  { machineNo: 'APS-01', machineName: 'Automatic Plating Line APS-01', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 100000 },
  { machineNo: 'SPL-01', machineName: 'Spoke Plating Line 01', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 50000 },
  { machineNo: 'BL-01', machineName: 'Barrel Machine BL-01', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-02', machineName: 'Barrel Machine BL-02', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-03', machineName: 'Barrel Machine BL-03', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-04', machineName: 'Barrel Machine BL-04', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-05', machineName: 'Barrel Machine BL-05', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-06', machineName: 'Barrel Machine BL-06', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-07', machineName: 'Barrel Machine BL-07', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-08', machineName: 'Barrel Machine BL-08', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },
  { machineNo: 'BL-09', machineName: 'Barrel Machine BL-09', department: 'Spoke Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 15000 },

  // Nipple Plating (APS-01-NP, BL-10 to BL-12, NPL-01) - Unit: Pcs
  { machineNo: 'NPL-01', machineName: 'Nipple Plating Line 01', department: 'Nipple Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 40000 },
  { machineNo: 'BL-10', machineName: 'Barrel Machine BL-10', department: 'Nipple Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 20000 },
  { machineNo: 'BL-11', machineName: 'Barrel Machine BL-11', department: 'Nipple Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 20000 },
  { machineNo: 'BL-12', machineName: 'Barrel Machine BL-12', department: 'Nipple Plating', divisionName: 'Spoke Division', unit: 'Pcs', standardCapacityPerShift: 20000 },

  // Spoke Packing (PKS-01, PKS-02, SPK-PK-01) - Unit: Gross (144 Pcs)
  { machineNo: 'PKS-01', machineName: 'Spoke Packing Station 01', department: 'Spoke Packing', divisionName: 'Spoke Division', unit: 'Gross (144 Pcs)', standardCapacityPerShift: 800 },
  { machineNo: 'PKS-02', machineName: 'Spoke Packing Station 02', department: 'Spoke Packing', divisionName: 'Spoke Division', unit: 'Gross (144 Pcs)', standardCapacityPerShift: 700 },
  { machineNo: 'SPK-PK-01', machineName: 'Spoke Boxing & Packing 01', department: 'Spoke Packing', divisionName: 'Spoke Division', unit: 'Gross (144 Pcs)', standardCapacityPerShift: 1500 },
];

export const naturalSortMachines = (a: string, b: string): number => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

export const getDepartmentOrder = (name: string, pipeline?: PipelineStep[]): number => {
  if (pipeline && pipeline.length > 0) {
    const n = (name || '').toLowerCase().trim();
    const idx = pipeline.findIndex((step) => {
      const s = (step.departmentKey || step.name).toLowerCase().trim();
      return n.includes(s) || s.includes(n);
    });
    if (idx !== -1) {
      return pipeline[idx].order || (idx + 1);
    }
    return 50;
  }
  const n = (name || '').toLowerCase();
  if (n.includes('flatten')) return 1;
  if (n.includes('straight')) return 2;
  if (n.includes('spiral')) return 3;
  if (n.includes('swag')) return 4;
  if (n.includes('pvc')) return 5;
  if (n.includes('spoke')) return 6;
  if (n.includes('plat')) return 7;
  if (n.includes('pack')) return 8;
  if (n.includes('dispatch')) return 9;
  return 20;
};

export const getDepartmentUnit = (name: string): string => {
  const n = (name || '').toLowerCase();
  if (n.includes('flatten')) return 'kg';
  if (n.includes('spiral') || n.includes('pvc')) return 'Mtr';
  if (n.includes('gross') || n.includes('spoke packing') || n.includes('spk-pk') || n.includes('144')) return 'Gross (144 Pcs)';
  if (n.includes('straight') || n.includes('swag') || n.includes('spoke') || n.includes('plat') || n.includes('header') || n.includes('nipple')) return 'Pcs';
  if (n.includes('pack')) return 'Coils';
  return 'Qty';
};

// ==========================================
// SEEDED FALLBACK DATA (Exact mirror of Supabase DB)
// ==========================================
const SEEDED_DIVISIONS: FilterOption[] = [
  { id: 'd1000000-0000-0000-0000-000000000002', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
  { id: 'd1000000-0000-0000-0000-000000000001', name: 'Spoke Division', divisionCode: 'DIV-SPD' },
  { id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec', name: 'Main Division E-51', divisionCode: 'DIV-PWI' },
  { id: '0653339b-94d0-4cc5-b880-e07908b2015f', name: 'NB Division', divisionCode: 'DIV-NB' },
  { id: '9efc527e-811d-4b45-92ea-4a562ab212cc', name: 'Finance & Administration Division', divisionCode: 'DIV-004' },
];

const SEEDED_PRODUCTION_ENTRIES: RealProductionEntry[] = [
  {
    id: '530c5403-4c12-4b74-bb77-6d0678a5a312',
    entryNumber: 'PE-2026-00070',
    entryDate: '2026-09-22',
    machineNo: 'FT-01',
    machineName: 'Flattening Machine FT-01',
    shiftName: 'Shift A (Morning)',
    operatorName: 'Hassan bilal',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Production',
    divisionId: 'd1000000-0000-0000-0000-000000000002',
    divisionName: 'Control Cable Division',
    itemCode: 'FLAT-WIRE-002',
    itemName: 'Flat Strip T 0.50 × W 3.00 mm',
    coilSize: '1.45 mm',
    targetQuantity: 78.75,
    actualQuantity: 60.00,
    varianceQuantity: -18.75,
    scrapQuantity: 2.00,
    efficiencyPercent: 87.50,
    runningHours: 7.0,
    downtimeHours: 1.0,
    status: 'On Track',
  },
  {
    id: '721767d0-d079-4f92-be23-069f7f5d3c9a',
    entryNumber: 'PE-2026-00069',
    entryDate: '2026-09-18',
    machineNo: 'FT-02',
    machineName: 'Flattening Machine FT-02',
    shiftName: 'Shift A (Morning)',
    operatorName: 'Hassan bilal',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Production',
    divisionId: 'd1000000-0000-0000-0000-000000000002',
    divisionName: 'Control Cable Division',
    itemCode: 'FLAT-WIRE-001',
    itemName: 'Flat Strip T 0.40 × W 2.60 mm',
    coilSize: '1.20 mm',
    targetQuantity: 70.00,
    actualQuantity: 60.00,
    varianceQuantity: -10.00,
    scrapQuantity: 2.00,
    efficiencyPercent: 87.50,
    runningHours: 7.0,
    downtimeHours: 1.0,
    status: 'On Track',
  },
  {
    id: 'f34e0d5e-f0ba-47b8-a5e2-e3df0765fee8',
    entryNumber: 'PE-2026-00068',
    entryDate: '2026-09-18',
    machineNo: 'FT-01',
    machineName: 'Flattening Machine FT-01',
    shiftName: 'Shift A (Morning)',
    operatorName: 'Hassan bilal',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Production',
    divisionId: 'd1000000-0000-0000-0000-000000000002',
    divisionName: 'Control Cable Division',
    itemCode: 'FLAT-WIRE-001',
    itemName: 'Flat Strip T 0.40 × W 2.60 mm',
    coilSize: '1.20 mm',
    targetQuantity: 60.00,
    actualQuantity: 55.00,
    varianceQuantity: -5.00,
    scrapQuantity: 2.00,
    efficiencyPercent: 75.00,
    runningHours: 6.0,
    downtimeHours: 2.0,
    status: 'On Track',
  },
  {
    id: '9d985738-d2c0-4d6d-b9f4-74ccb9e6711e',
    entryNumber: 'PE-2026-00067',
    entryDate: '2026-09-17',
    machineNo: 'FT-01',
    machineName: 'Flattening Machine FT-01',
    shiftName: 'Shift A (Morning)',
    operatorName: 'Hassan bilal',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Production',
    divisionId: 'd1000000-0000-0000-0000-000000000002',
    divisionName: 'Control Cable Division',
    itemCode: 'FLAT-WIRE-002',
    itemName: 'Flat Strip T 0.50 × W 3.00 mm',
    coilSize: '1.45 mm',
    targetQuantity: 78.75,
    actualQuantity: 70.00,
    varianceQuantity: -8.75,
    scrapQuantity: 1.00,
    efficiencyPercent: 87.50,
    runningHours: 7.0,
    downtimeHours: 1.0,
    status: 'On Track',
  },
  {
    id: '87d8def9-211d-416b-a74a-adda75039114',
    entryNumber: 'PE-2026-00066',
    entryDate: '2026-09-15',
    machineNo: 'ST-01',
    machineName: 'Straightener Machine ST-01',
    shiftName: 'General Shift',
    operatorName: 'Imran Naveed',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Straightener',
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionName: 'Spoke Division',
    itemCode: 'WIP-ST-011',
    itemName: '250*17 Outer Straight Wire',
    coilSize: '3.14 mm',
    targetQuantity: 63000.00,
    actualQuantity: 50000.00,
    varianceQuantity: -13000.00,
    scrapQuantity: 5.00,
    efficiencyPercent: 87.50,
    runningHours: 7.0,
    downtimeHours: 1.0,
    status: 'Completed',
    remarks: 'Roller guide calibration adjusted at start; shift target yield stabilized.',
  },
  {
    id: '2a1b9487-1111-4444-8888-abcdef123456',
    entryNumber: 'PE-2026-00065',
    entryDate: '2026-09-14',
    machineNo: 'ST-02',
    machineName: 'Straightener Machine ST-02',
    shiftName: 'Shift B (Afternoon)',
    operatorName: 'Imran Naveed',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Straightener',
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionName: 'Spoke Division',
    itemCode: 'WIP-ST-012',
    itemName: '300*18 Inner Spoke Wire',
    coilSize: '3.20 mm',
    targetQuantity: 55000.00,
    actualQuantity: 56200.00,
    varianceQuantity: 1200.00,
    scrapQuantity: 3.50,
    efficiencyPercent: 102.18,
    runningHours: 8.0,
    downtimeHours: 0.0,
    status: 'Completed',
    remarks: 'Continuous run, high wire precision, target exceeded with zero downtime.',
  },
  {
    id: '3c2d8574-2222-5555-9999-bcdef1234567',
    entryNumber: 'PE-2026-00064',
    entryDate: '2026-09-12',
    machineNo: 'SP-06',
    machineName: 'Spiral Machine SP-06',
    shiftName: 'Shift C (Night)',
    operatorName: 'Muhammad Akram',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Spiral',
    divisionId: 'd1000000-0000-0000-0000-000000000002',
    divisionName: 'Control Cable Division',
    itemCode: 'WIP-SP-004',
    itemName: 'Galvanized Spiral Cable 4.5mm',
    coilSize: '2.00 mm',
    targetQuantity: 450.00,
    actualQuantity: 465.00,
    varianceQuantity: 15.00,
    scrapQuantity: 4.20,
    efficiencyPercent: 103.33,
    runningHours: 8.0,
    downtimeHours: 0.0,
    status: 'Completed',
    remarks: 'Smooth night run, zero cable jam, spooling neat and uniform.',
  },
  {
    id: '4d3e9685-3333-6666-aaaa-cdef12345678',
    entryNumber: 'PE-2026-00063',
    entryDate: '2026-09-10',
    machineNo: 'SW-01',
    machineName: 'Swaging Machine SW-01',
    shiftName: 'Shift A (Morning)',
    operatorName: 'Tariq Mehmood',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Swagging',
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionName: 'Spoke Division',
    itemCode: 'WIP-SW-001',
    itemName: 'Swaged Spoke Blank 10G',
    coilSize: '3.14 mm',
    targetQuantity: 35000.00,
    actualQuantity: 31500.00,
    varianceQuantity: -3500.00,
    scrapQuantity: 8.00,
    efficiencyPercent: 90.00,
    runningHours: 7.0,
    downtimeHours: 1.0,
    status: 'On Track',
    remarks: 'Hammer die replaced after batch #1; 1h minor downtime recorded.',
  },
  {
    id: '5e4f0796-4444-7777-bbbb-def123456789',
    entryNumber: 'PE-2026-00062',
    entryDate: '2026-09-11',
    machineNo: 'SPK-01',
    machineName: 'Spoke Heading & Threading 01',
    shiftName: 'Shift A (Morning)',
    operatorName: 'Tariq Mehmood',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Spoke',
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionName: 'Spoke Division',
    itemCode: 'WIP-SPK-002',
    itemName: 'Polished Spoke 10G-250mm',
    coilSize: '3.14 mm',
    targetQuantity: 30000.00,
    actualQuantity: 29400.00,
    varianceQuantity: -600.00,
    scrapQuantity: 12.00,
    efficiencyPercent: 98.00,
    runningHours: 8.0,
    downtimeHours: 0.0,
    status: 'Completed',
    remarks: 'Heading punch inspected; thread pitch gauge test passed at 100%.',
  },
  {
    id: '6f5a1807-5555-8888-cccc-ef1234567890',
    entryNumber: 'PE-2026-00061',
    entryDate: '2026-09-12',
    machineNo: 'PLT-01',
    machineName: 'Zinc Plating Bath 01',
    shiftName: 'Shift B (Afternoon)',
    operatorName: 'Rashid Khan',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Spoke Plating',
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionName: 'Spoke Division',
    itemCode: 'FG-SPK-PLT',
    itemName: 'Electroplated Spokes Grade A',
    coilSize: '3.14 mm',
    targetQuantity: 45000.00,
    actualQuantity: 44200.00,
    varianceQuantity: -800.00,
    scrapQuantity: 15.00,
    efficiencyPercent: 98.22,
    runningHours: 7.5,
    downtimeHours: 0.5,
    status: 'Completed',
    remarks: 'Electrolyte zinc bath chemistry balanced; uniform micron coating confirmed.',
  },
  {
    id: '7a6b2918-6666-9999-dddd-f12345678901',
    entryNumber: 'PE-2026-00060',
    entryDate: '2026-09-13',
    machineNo: 'SPK-PK-01',
    machineName: 'Spoke Boxing & Packing 01',
    shiftName: 'General Shift',
    operatorName: 'Muhammad Nasir',
    supervisorName: 'Muhammad Afsar',
    departmentName: 'Spoke Packing',
    divisionId: 'd1000000-0000-0000-0000-000000000001',
    divisionName: 'Spoke Division',
    itemCode: 'BOX-SPK-001',
    itemName: 'Spoke & Nipple Set 144 pcs/Box',
    coilSize: '1 Box',
    targetQuantity: 1200.00,
    actualQuantity: 1250.00,
    varianceQuantity: 50.00,
    scrapQuantity: 0.00,
    efficiencyPercent: 104.17,
    runningHours: 8.0,
    downtimeHours: 0.0,
    status: 'Completed',
    remarks: '1250 boxes packed, barcode stamped and forwarded to SPI dispatch.',
  },
];

const SEEDED_SALES_INVOICES: RealSalesInvoice[] = [
  {
    id: '5253dbe8-c318-4021-b25a-ef66cb5003c2',
    invoiceNo: 'SI-2026-00002',
    customerName: 'National Trading Corporation',
    customerCode: 'CUST-0002',
    invoiceDate: '2026-07-25',
    dueDate: '2026-09-08',
    subtotal: 225000.00,
    taxAmount: 40500.00,
    totalAmount: 254250.00,
    paidAmount: 0.00,
    dueAmount: 254250.00,
    status: 'Pending',
  },
  {
    id: '61159cab-0a16-479c-b339-e0d8f3597009',
    invoiceNo: 'SI-2026-00003',
    customerName: 'TechStart Pakistan Pvt Ltd',
    customerCode: 'CUST-0003',
    invoiceDate: '2026-07-28',
    dueDate: '2026-08-27',
    subtotal: 120000.00,
    taxAmount: 21600.00,
    totalAmount: 141600.00,
    paidAmount: 141600.00,
    dueAmount: 0.00,
    status: 'Paid',
  },
  {
    id: '31a47ff6-319c-4145-be1f-e9873b4e692e',
    invoiceNo: 'SI-2026-00004',
    customerName: 'Metro Wholesale Market',
    customerCode: 'CUST-0004',
    invoiceDate: '2026-08-08',
    dueDate: '2026-11-06',
    subtotal: 1500000.00,
    taxAmount: 256500.00,
    totalAmount: 1681500.00,
    paidAmount: 500000.00,
    dueAmount: 1181500.00,
    status: 'Partial',
  },
  {
    id: '2aeb8a85-88eb-4b7d-b19a-ba85e35bdac1',
    invoiceNo: 'SI-2026-00005',
    customerName: 'Green Valley Industries',
    customerCode: 'CUST-0005',
    invoiceDate: '2026-08-12',
    dueDate: '2026-10-11',
    subtotal: 15000.00,
    taxAmount: 0.00,
    totalAmount: 14250.00,
    paidAmount: 0.00,
    dueAmount: 14250.00,
    status: 'Pending',
  },
  {
    id: 'si-2026-00010',
    invoiceNo: 'SI-2026-00010',
    customerName: 'Blue Star Electronics',
    customerCode: 'CUST-0006',
    invoiceDate: '2026-08-15',
    dueDate: '2026-10-14',
    subtotal: 15000.00,
    taxAmount: 0.00,
    totalAmount: 14250.00,
    paidAmount: 14250.00,
    dueAmount: 0.00,
    status: 'Paid',
  },
  {
    id: 'si-2026-00013',
    invoiceNo: 'SI-2026-00013',
    customerName: 'Crown Infrastructure Group',
    customerCode: 'CUST-0007',
    invoiceDate: '2026-09-26',
    dueDate: '2026-10-25',
    subtotal: 250000.00,
    taxAmount: 45000.00,
    totalAmount: 295000.00,
    paidAmount: 0.00,
    dueAmount: 295000.00,
    status: 'Pending',
  },
];

// ==========================================
// MAIN COMPONENT
// ==========================================

export const GeneralReports: React.FC = () => {
  // Navigation & Category State
  const [selectedCategory, setSelectedCategory] = useState<ReportCategoryKey>('production');
  const [selectedReport, setSelectedReport] = useState<ReportId>('prod_daily');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [searchNavText, setSearchNavText] = useState<string>('');
  const [tableSearchText, setTableSearchText] = useState<string>('');

  // Date & Filter State - Defaults to 'all' (All Available Supabase Records)
  const [timeframe, setTimeframe] = useState<TimeframePreset>('all');
  const [fromDate, setFromDate] = useState<Dayjs | null>(null);
  const [toDate, setToDate] = useState<Dayjs | null>(null);
  const [groupBy, setGroupBy] = useState<string>('day');

  // Sub-view toggle for Target vs Actual: 'machine' | 'department'
  const [targetSubView, setTargetSubView] = useState<'machine' | 'department'>('machine');

  // Sub-view toggle for Scrap & Rejection: 'machine' | 'department'
  const [scrapSubView, setScrapSubView] = useState<'machine' | 'department'>('machine');

  // View mode toggle: 'summary' | 'detailed'
  const [detailMode, setDetailMode] = useState<'summary' | 'detailed'>('summary');

  // Chart Visualization Type Switcher: 'horizontal' | 'column' | 'donut' | 'efficiency'
  const [chartType, setChartType] = useState<ChartType>('horizontal');

  // Live Backend & Supabase Data
  const [loading, setLoading] = useState<boolean>(false);
  const [divisionsList, setDivisionsList] = useState<FilterOption[]>(SEEDED_DIVISIONS);
  const [departmentsList, setDepartmentsList] = useState<Array<{ id: string; name: string; division_id?: string | null; divisionId?: string | null }>>(SEEDED_DEPARTMENTS);
  const [productionEntries, setProductionEntries] = useState<RealProductionEntry[]>(SEEDED_PRODUCTION_ENTRIES);
  const [salesInvoices, setSalesInvoices] = useState<RealSalesInvoice[]>(SEEDED_SALES_INVOICES);

  // Custom Process Sequences per Division (persisted in localStorage)
  const [customSequences, setCustomSequences] = useState<Record<string, PipelineStep[]>>(() => {
    try {
      const raw = localStorage.getItem('pwi_division_pipeline_seq_v4');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Cleanse any legacy sequences that may contain obsolete placeholder strings
      const cleaned: Record<string, PipelineStep[]> = {};
      Object.entries(parsed).forEach(([k, steps]) => {
        if (Array.isArray(steps)) {
          const hasObsolete = steps.some((s: any) =>
            typeof s?.name === 'string' && (
              s.name.toLowerCase().includes('polished spoke production') ||
              s.name.toLowerCase().includes('wire rod')
            )
          );
          if (!hasObsolete) {
            cleaned[k] = steps;
          }
        }
      });
      return cleaned;
    } catch {
      return {};
    }
  });

  // Modal State for Process Sequence Configuration
  const [isSeqModalOpen, setIsSeqModalOpen] = useState<boolean>(false);
  const [editingSteps, setEditingSteps] = useState<PipelineStep[]>([]);
  const [isAddStageModalOpen, setIsAddStageModalOpen] = useState<boolean>(false);
  const [customStageName, setCustomStageName] = useState<string>('');
  const [customStageSubtext, setCustomStageSubtext] = useState<string>('');
  const [customStageUnit, setCustomStageUnit] = useState<string>('Gross (144 Pcs)');

  // Currently Active Division Details
  const activeDivisionObj = useMemo(() => {
    if (selectedDivision === 'all') {
      return { id: 'all', name: 'All Plant Divisions', divisionCode: 'ALL' };
    }
    const found = divisionsList.find((d) => d.id === selectedDivision);
    if (found) return found;
    if (selectedDivision === 'd1000000-0000-0000-0000-000000000001') {
      return { id: selectedDivision, name: 'Spoke Division', divisionCode: 'DIV-SPD' };
    }
    if (selectedDivision === 'd1000000-0000-0000-0000-000000000002') {
      return { id: selectedDivision, name: 'Control Cable Division', divisionCode: 'DIV-CCD' };
    }
    return { id: selectedDivision, name: selectedDivision, divisionCode: 'DIV' };
  }, [selectedDivision, divisionsList]);

  // Division Pipeline Key for Factory Fallback
  const divisionPipelineKey = useMemo(() => {
    return getDivisionPipelineKey(activeDivisionObj.id + ' ' + activeDivisionObj.name);
  }, [activeDivisionObj]);

  // Dynamically resolve default pipeline for selected division using ALL real DB departments
  const defaultDivisionPipeline: PipelineStep[] = useMemo(() => {
    const basePreset = DEFAULT_DIVISION_PIPELINES[divisionPipelineKey];
    const divDepts = departmentsList.filter((d) => {
      if (activeDivisionObj.id === 'all') return true;
      const divId = d.division_id || d.divisionId;
      return divId === activeDivisionObj.id;
    });

    if (basePreset && basePreset.length > 0) {
      const steps = [...basePreset];
      // Append any registered department belonging to this division that is not in base preset
      divDepts.forEach((d) => {
        const lowerName = d.name.toLowerCase();
        if (lowerName.includes('maintenance') || lowerName.includes('stores')) return;
        const exists = steps.some(
          (s) => s.name.toLowerCase() === lowerName || (s.departmentKey && s.departmentKey.toLowerCase() === lowerName)
        );
        if (!exists) {
          steps.push({
            id: `dept-${d.id}`,
            order: steps.length + 1,
            name: d.name,
            subtext: `Stage #${steps.length + 1}`,
            departmentKey: d.name,
            unit: getDepartmentUnit(d.name),
          });
        }
      });
      return steps.map((s, idx) => ({ ...s, order: idx + 1 }));
    }

    if (divDepts.length > 0) {
      return divDepts
        .filter((d) => !d.name.toLowerCase().includes('maintenance') && !d.name.toLowerCase().includes('stores'))
        .map((d, idx) => ({
          id: `dept-${d.id}`,
          order: idx + 1,
          name: d.name,
          subtext: `Stage #${idx + 1}`,
          departmentKey: d.name,
          unit: getDepartmentUnit(d.name),
        }));
    }

    return DEFAULT_DIVISION_PIPELINES['default'];
  }, [divisionPipelineKey, departmentsList, activeDivisionObj.id]);

  // Currently Active Pipeline Steps (User custom sequence or division auto-generated default)
  const activePipeline: PipelineStep[] = useMemo(() => {
    const saved = customSequences[activeDivisionObj.id];
    if (saved && Array.isArray(saved) && saved.length > 0) {
      const hasObsolete = saved.some((s) =>
        s.name.toLowerCase().includes('polished spoke production') ||
        s.name.toLowerCase().includes('wire rod')
      );
      if (!hasObsolete) {
        return saved;
      }
    }
    return defaultDivisionPipeline;
  }, [customSequences, activeDivisionObj.id, defaultDivisionPipeline]);

  // Dynamic Department Ordering using Active Pipeline Sequence
  const getDeptOrder = useCallback((deptName: string): number => {
    return getDepartmentOrder(deptName, activePipeline);
  }, [activePipeline]);


  // 1. Fetch Real Divisions from Supabase / Backend API
  const loadDivisions = useCallback(async () => {
    try {
      const res = await dashboardService.getFilterDivisions();
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        setDivisionsList(res.data);
      }
    } catch {
      // Graceful fallback to seeded real divisions
      setDivisionsList(SEEDED_DIVISIONS);
    }
  }, []);

  // 1b. Fetch Real Departments from Supabase / Backend API
  const loadDepartments = useCallback(async () => {
    try {
      const res = await dashboardService.getFilterDepartments();
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        setDepartmentsList(res.data as any);
      }
    } catch {
      // Graceful fallback to canonical seeded departments
      setDepartmentsList(SEEDED_DEPARTMENTS);
    }
  }, []);

  // 2. Fetch Real Production Data from Supabase / Backend API
  const loadProductionData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 1000 };
      if (selectedDivision !== 'all') params.divisionId = selectedDivision;
      if (fromDate) params.dateFrom = fromDate.format('YYYY-MM-DD');
      if (toDate) params.dateTo = toDate.format('YYYY-MM-DD');

      const res = await apiService.get<any>('/production/entries', params);
      const rawList = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);

      if (rawList.length > 0) {
        const mapped: RealProductionEntry[] = rawList.map((r: any) => {
          const tQty = Number(r.targetQuantity ?? r.target_quantity ?? 0);
          const aQty = Number(r.actualQuantity ?? r.actual_quantity ?? 0);
          const sQty = Number(r.scrapQuantity ?? r.scrap_quantity ?? 0);
          const eff = Number(
            r.efficiencyPercentage ??
            r.efficiency_percentage ??
            (tQty > 0 ? (aQty / tQty) * 100 : 0)
          );
          const rawDate = r.entryDate || r.entry_date;
          const shiftTitle = typeof r.shift === 'object' && r.shift?.name
            ? r.shift.name
            : (typeof r.shiftName === 'string' ? r.shiftName : (typeof r.shift === 'string' ? r.shift : 'General Shift'));

          return {
            id: r.id,
            entryNumber: r.entryNumber || r.entry_number || `PE-${String(r.id).slice(0, 6)}`,
            entryDate: rawDate ? dayjs(rawDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
            machineNo: r.machineNo || r.machine_no || r.machine?.machineNo || r.machine?.machineCode || 'MCN-01',
            machineName: r.machine?.name || r.machineName || (r.machineNo ? `Machine ${r.machineNo}` : 'Plant Machine'),
            shiftName: String(shiftTitle).replace(/[\r\n]+/g, ' ').trim() || 'General Shift',
            operatorName: r.operatorName || r.operator_name || 'Hassan bilal',
            supervisorName: r.supervisorName || r.supervisor_name || 'Muhammad Afsar',
            departmentName: r.department?.name || r.departmentName || 'Production',
            divisionId: r.divisionId || r.division_id || r.division?.id || '',
            divisionName: r.division?.name || r.divisionName || (r.divisionId === 'd1000000-0000-0000-0000-000000000002' ? 'Control Cable Division' : 'Spoke Division'),
            itemCode: r.item?.itemCode || r.item?.item_code || r.itemCode || 'WIP-ITEM',
            itemName: r.item?.name || r.itemName || 'Production Item',
            coilSize: r.coilSize || r.coil_size || '1.45 mm',
            targetQuantity: tQty,
            actualQuantity: aQty,
            varianceQuantity: aQty - tQty,
            scrapQuantity: sQty,
            efficiencyPercent: eff,
            runningHours: Number(r.runningHours ?? r.running_hours ?? 8),
            downtimeHours: Number(r.downtimeHours ?? r.downtime_hours ?? 0),
            status: eff >= 95 ? 'Completed' : eff >= 75 ? 'On Track' : 'Delayed',
            remarks: r.remarks || r.notes || r.downtimeReason || r.downtime_reason || '',
          };
        });
        setProductionEntries(mapped);
      } else {
        setProductionEntries(SEEDED_PRODUCTION_ENTRIES);
      }
    } catch {
      setProductionEntries(SEEDED_PRODUCTION_ENTRIES);
    } finally {
      setLoading(false);
    }
  }, [selectedDivision, fromDate, toDate]);

  // 3. Fetch Real Sales Invoices from Supabase / Backend API
  const loadSalesData = useCallback(async () => {
    try {
      const res = await apiService.get<any>('/sales/invoices', { limit: 200 });
      const rawList = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);

      if (rawList.length > 0) {
        const mapped: RealSalesInvoice[] = rawList.map((inv: any) => {
          const tot = Number(inv.totalAmount ?? inv.total_amount ?? 0);
          const pd = Number(inv.paidAmount ?? inv.paid_amount ?? 0);
          const rawInvDate = inv.invoiceDate || inv.invoice_date;
          const rawDueDate = inv.dueDate || inv.due_date;
          const custName = inv.customer?.companyName || inv.customer?.company_name || inv.customer?.name || inv.customerName || 'Customer';
          const custCode = inv.customer?.customerCode || inv.customer?.customer_code || inv.customerCode || '';

          return {
            id: inv.id,
            invoiceNo: inv.invoiceNo || inv.invoice_no || `SI-${String(inv.id).slice(0, 6)}`,
            customerName: custName,
            customerCode: custCode,
            invoiceDate: rawInvDate ? dayjs(rawInvDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
            dueDate: rawDueDate ? dayjs(rawDueDate).format('YYYY-MM-DD') : dayjs().add(30, 'day').format('YYYY-MM-DD'),
            subtotal: Number(inv.subtotal ?? 0),
            taxAmount: Number(inv.taxAmount ?? inv.tax_amount ?? 0),
            totalAmount: tot,
            paidAmount: pd,
            dueAmount: Math.max(0, tot - pd),
            status: (inv.status || 'Pending') as any,
          };
        });
        setSalesInvoices(mapped);
      } else {
        setSalesInvoices(SEEDED_SALES_INVOICES);
      }
    } catch {
      setSalesInvoices(SEEDED_SALES_INVOICES);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadDivisions();
    void loadDepartments();
    void loadProductionData();
    void loadSalesData();
  }, [loadDivisions, loadDepartments, loadProductionData, loadSalesData]);

  // Handle Quick Timeframe Change with Last Quarter support
  const handleTimeframeChange = (preset: TimeframePreset) => {
    setTimeframe(preset);
    const now = dayjs();
    switch (preset) {
      case 'all':
        setFromDate(null);
        setToDate(null);
        break;
      case 'today':
        setFromDate(now.startOf('day'));
        setToDate(now.endOf('day'));
        break;
      case 'this_month':
        setFromDate(now.startOf('month'));
        setToDate(now.endOf('month'));
        break;
      case 'last_month':
        setFromDate(now.subtract(1, 'month').startOf('month'));
        setToDate(now.subtract(1, 'month').endOf('month'));
        break;
      case 'this_quarter': {
        const qIdx = Math.floor(now.month() / 3);
        const qYr = now.year();
        const startM = qIdx * 3;
        setFromDate(dayjs(new Date(qYr, startM, 1)).startOf('day'));
        setToDate(dayjs(new Date(qYr, startM + 2, 1)).endOf('month'));
        break;
      }
      case 'last_quarter': {
        const curM = now.month();
        const prevQIdx = (Math.floor(curM / 3) + 3) % 4;
        const prevQYr = curM < 3 ? now.year() - 1 : now.year();
        const startM = prevQIdx * 3;
        setFromDate(dayjs(new Date(prevQYr, startM, 1)).startOf('day'));
        setToDate(dayjs(new Date(prevQYr, startM + 2, 1)).endOf('month'));
        break;
      }
      case 'this_year':
        setFromDate(now.startOf('year'));
        setToDate(now.endOf('year'));
        break;
      case 'custom':
        break;
    }
  };

  // Filtered Production Records (Filtered by Division & Search Text)
  const filteredProduction = useMemo(() => {
    return productionEntries.filter((row) => {
      if (selectedDivision !== 'all') {
        const divMatch = row.divisionId === selectedDivision || row.divisionName?.toLowerCase().includes(selectedDivision.toLowerCase());
        if (!divMatch) return false;
      }
      if (tableSearchText) {
        const q = tableSearchText.toLowerCase();
        return (
          row.entryNumber.toLowerCase().includes(q) ||
          row.machineNo.toLowerCase().includes(q) ||
          row.machineName.toLowerCase().includes(q) ||
          row.operatorName.toLowerCase().includes(q) ||
          row.itemName.toLowerCase().includes(q) ||
          row.itemCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [productionEntries, selectedDivision, tableSearchText]);

  // Filtered Sales Invoices
  const filteredSales = useMemo(() => {
    return salesInvoices.filter((row) => {
      if (tableSearchText) {
        const q = tableSearchText.toLowerCase();
        return (
          row.invoiceNo.toLowerCase().includes(q) ||
          row.customerName.toLowerCase().includes(q) ||
          (row.customerCode && row.customerCode.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [salesInvoices, tableSearchText]);

  // Production Summary KPIs
  const prodSummary = useMemo(() => {
    const totalTarget = filteredProduction.reduce((a, b) => a + b.targetQuantity, 0);
    const totalActual = filteredProduction.reduce((a, b) => a + b.actualQuantity, 0);
    const totalVariance = totalActual - totalTarget;
    const avgEfficiency = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
    const totalScrap = filteredProduction.reduce((a, b) => a + b.scrapQuantity, 0);
    const totalDowntime = filteredProduction.reduce((a, b) => a + b.downtimeHours, 0);
    return {
      totalTarget,
      totalActual,
      totalVariance,
      avgEfficiency,
      totalScrap,
      totalDowntime,
      count: filteredProduction.length,
    };
  }, [filteredProduction]);

  // Sales Summary KPIs
  const salesSummary = useMemo(() => {
    const totalBilled = filteredSales.reduce((a, b) => a + b.totalAmount, 0);
    const totalPaid = filteredSales.reduce((a, b) => a + b.paidAmount, 0);
    const totalDue = filteredSales.reduce((a, b) => a + b.dueAmount, 0);
    return {
      count: filteredSales.length,
      totalBilled,
      totalPaid,
      totalDue,
      grossProfit: totalBilled * 0.32,
    };
  }, [filteredSales]);

  // Departments belonging to current division that are currently NOT in editingSteps
  const excludedDivisionDepartments = useMemo(() => {
    const divDepts = departmentsList.filter((d) => {
      if (activeDivisionObj.id === 'all') return false;
      const divId = d.division_id || d.divisionId;
      return divId === activeDivisionObj.id;
    });

    return divDepts.filter((dept) => {
      // Exclude utility / maintenance depts from quick bank unless user adds manually
      if (dept.name.toLowerCase().includes('maintenance') || dept.name.toLowerCase().includes('stores')) return false;
      return !editingSteps.some(
        (s) => s.name.toLowerCase() === dept.name.toLowerCase() ||
               (s.departmentKey && s.departmentKey.toLowerCase() === dept.name.toLowerCase())
      );
    });
  }, [departmentsList, activeDivisionObj.id, editingSteps]);

  // Modal Handlers for Process Sequence Configuration
  const handleOpenSeqModal = () => {
    // Automatically load all departments for this division into sequence!
    setEditingSteps([...activePipeline]);
    setIsSeqModalOpen(true);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editingSteps.length) return;
    const newArr = [...editingSteps];
    const [moved] = newArr.splice(index, 1);
    newArr.splice(targetIndex, 0, moved);
    setEditingSteps(newArr.map((s, idx) => ({ ...s, order: idx + 1 })));
  };

  const handleRemoveStep = (index: number) => {
    const newArr = editingSteps.filter((_, idx) => idx !== index);
    setEditingSteps(newArr.map((s, idx) => ({ ...s, order: idx + 1 })));
  };

  const handleAssignDepartmentStep = (deptName: string) => {
    const exists = editingSteps.some(
      (s) => s.name.toLowerCase() === deptName.toLowerCase() || (s.departmentKey && s.departmentKey.toLowerCase() === deptName.toLowerCase())
    );
    if (exists) {
      message.info(`${deptName} is already assigned in the sequence`);
      return;
    }
    const newOrder = editingSteps.length + 1;
    const unit = getDepartmentUnit(deptName);
    const newStep: PipelineStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order: newOrder,
      name: deptName,
      subtext: `Stage #${newOrder} (${unit})`,
      departmentKey: deptName,
      unit,
    };
    setEditingSteps((prev) => [...prev, newStep]);
    message.success(`Added ${deptName} to sequence as Step #${newOrder}!`);
  };

  const handleConfirmAddCustomStage = () => {
    if (!customStageName.trim()) {
      message.warning('Please enter a stage or department name');
      return;
    }
    const trimmed = customStageName.trim();
    const newOrder = editingSteps.length + 1;
    const newStep: PipelineStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order: newOrder,
      name: trimmed,
      subtext: customStageSubtext.trim() || `Stage #${newOrder} (${customStageUnit})`,
      departmentKey: trimmed,
      unit: customStageUnit,
    };
    setEditingSteps((prev) => [...prev, newStep]);
    setCustomStageName('');
    setCustomStageSubtext('');
    setCustomStageUnit('Gross (144 Pcs)');
    setIsAddStageModalOpen(false);
    message.success(`Added "${trimmed}" to sequence as Step #${newOrder}!`);
  };

  const handleResetFactory = () => {
    setEditingSteps([...defaultDivisionPipeline]);
    message.info(`Reset to default sequential departments for ${activeDivisionObj.name}`);
  };

  const handleSaveSequence = () => {
    if (editingSteps.length === 0) {
      message.warning('Sequence cannot be empty');
      return;
    }
    const reindexed = editingSteps.map((s, idx) => ({ ...s, order: idx + 1 }));
    const updated = {
      ...customSequences,
      [activeDivisionObj.id]: reindexed,
    };
    setCustomSequences(updated);
    try {
      localStorage.setItem('pwi_division_pipeline_seq_v4', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    setIsSeqModalOpen(false);
    message.success(`Process sequence saved permanently for ${activeDivisionObj.name}!`);
  };

  // Shift-wise Aggregated Data
  const shiftSummary = useMemo(() => {
    const map = new Map<string, {
      shift: string;
      totalTarget: number;
      totalActual: number;
      totalScrap: number;
      totalRunning: number;
      totalDowntime: number;
      count: number;
    }>();

    filteredProduction.forEach((r) => {
      const shift = r.shiftName || 'General Shift';
      const curr = map.get(shift) || {
        shift,
        totalTarget: 0,
        totalActual: 0,
        totalScrap: 0,
        totalRunning: 0,
        totalDowntime: 0,
        count: 0,
      };
      curr.totalTarget += r.targetQuantity;
      curr.totalActual += r.actualQuantity;
      curr.totalScrap += r.scrapQuantity;
      curr.totalRunning += r.runningHours;
      curr.totalDowntime += r.downtimeHours;
      curr.count += 1;
      map.set(shift, curr);
    });

    return Array.from(map.values()).map((s) => ({
      ...s,
      variance: s.totalActual - s.totalTarget,
      efficiency: s.totalTarget > 0 ? (s.totalActual / s.totalTarget) * 100 : 0,
    }));
  }, [filteredProduction]);

  // Operator-wise Aggregated Data
  const operatorSummary = useMemo(() => {
    const map = new Map<string, {
      operator: string;
      supervisor: string;
      machines: Set<string>;
      totalTarget: number;
      totalActual: number;
      totalScrap: number;
      totalRunning: number;
      count: number;
    }>();

    filteredProduction.forEach((r) => {
      const op = r.operatorName || 'Hassan bilal';
      const curr = map.get(op) || {
        operator: op,
        supervisor: r.supervisorName || 'Muhammad Afsar',
        machines: new Set<string>(),
        totalTarget: 0,
        totalActual: 0,
        totalScrap: 0,
        totalRunning: 0,
        count: 0,
      };
      if (r.machineNo) curr.machines.add(r.machineNo);
      curr.totalTarget += r.targetQuantity;
      curr.totalActual += r.actualQuantity;
      curr.totalScrap += r.scrapQuantity;
      curr.totalRunning += r.runningHours;
      curr.count += 1;
      map.set(op, curr);
    });

    return Array.from(map.values()).map((o) => ({
      ...o,
      machineList: Array.from(o.machines).sort(naturalSortMachines).join(', '),
      variance: o.totalActual - o.totalTarget,
      efficiency: o.totalTarget > 0 ? (o.totalActual / o.totalTarget) * 100 : 0,
    }));
  }, [filteredProduction]);

  // Machine-wise Aggregated Data with Fleet Registry Integration & Natural Sorting
  const machineSummary = useMemo(() => {
    const map = new Map<string, {
      machineNo: string;
      machineName: string;
      department: string;
      divisionName: string;
      unit: string;
      totalTarget: number;
      totalActual: number;
      totalScrap: number;
      totalDowntime: number;
      totalRunning: number;
      count: number;
      remarks: string;
    }>();

    // 1. Seed with known machines from master registry matching current division filter
    MASTER_MACHINES.forEach((m) => {
      if (selectedDivision !== 'all') {
        const isMatch = m.divisionName.toLowerCase().includes(selectedDivision.toLowerCase()) ||
          (selectedDivision === 'd1000000-0000-0000-0000-000000000002' && m.divisionName === 'Control Cable Division') ||
          (selectedDivision === 'd1000000-0000-0000-0000-000000000001' && m.divisionName === 'Spoke Division');
        if (!isMatch) return;
      }
      map.set(m.machineNo, {
        machineNo: m.machineNo,
        machineName: m.machineName,
        department: m.department,
        divisionName: m.divisionName,
        unit: m.unit,
        totalTarget: m.standardCapacityPerShift || 0,
        totalActual: 0,
        totalScrap: 0,
        totalDowntime: 0,
        totalRunning: 0,
        count: 0,
        remarks: '',
      });
    });

    // 2. Accumulate live records from production entries
    filteredProduction.forEach((r) => {
      const key = r.machineNo || r.machineName;
      const existing = map.get(key) || {
        machineNo: r.machineNo,
        machineName: r.machineName,
        department: r.departmentName || 'Production',
        divisionName: r.divisionName || 'Control Cable Division',
        unit: getDepartmentUnit(r.departmentName || ''),
        totalTarget: 0,
        totalActual: 0,
        totalScrap: 0,
        totalDowntime: 0,
        totalRunning: 0,
        count: 0,
        remarks: '',
      };
      if (existing.count === 0) {
        if (r.targetQuantity > 0) {
          existing.totalTarget = r.targetQuantity;
        }
      } else {
        if (r.targetQuantity > 0) {
          existing.totalTarget += r.targetQuantity;
        }
      }
      existing.totalActual += r.actualQuantity;
      existing.totalScrap += r.scrapQuantity;
      existing.totalDowntime += r.downtimeHours;
      existing.totalRunning += r.runningHours;
      existing.count += 1;
      if (r.remarks && r.remarks.trim()) {
        existing.remarks = existing.remarks ? `${existing.remarks}; ${r.remarks.trim()}` : r.remarks.trim();
      }
      map.set(key, existing);
    });

    return Array.from(map.values())
      .map((m) => {
        const variance = m.totalActual - m.totalTarget;
        const efficiency = m.totalTarget > 0 ? (m.totalActual / m.totalTarget) * 100 : (m.totalActual > 0 ? 100 : 0);
        const scrapRate = m.totalActual > 0 ? (m.totalScrap / m.totalActual) * 100 : 0;
        const status: 'Completed' | 'On Track' | 'Delayed' | 'Idle / OFF' = m.count === 0
          ? 'Idle / OFF'
          : efficiency >= 95
          ? 'Completed'
          : efficiency >= 75
          ? 'On Track'
          : 'Delayed';
        const remarksDisplay = m.count === 0
          ? 'Idle — No production logged'
          : m.remarks
          ? m.remarks
          : efficiency >= 95
          ? 'Target achieved'
          : 'Production ongoing';
        return {
          ...m,
          variance,
          efficiency,
          scrapRate,
          status,
          remarks: remarksDisplay,
        };
      })
      .sort((a, b) => {
        const deptOrder = getDeptOrder(a.department) - getDeptOrder(b.department);
        if (deptOrder !== 0) return deptOrder;
        return naturalSortMachines(a.machineNo, b.machineNo);
      });
  }, [filteredProduction, selectedDivision, getDeptOrder]);

  // Department-wise Aggregated Data with Chronological Workflow Sorting & Sub-Machines
  const departmentSummary = useMemo(() => {
    // 1. Gather all department names for current division
    const deptsInDivision = new Set<string>();

    // a. From active pipeline steps (preserve pipeline sequence)
    activePipeline.forEach((step) => {
      const stepName = step.departmentKey || step.name;
      if (stepName && !stepName.toLowerCase().includes('raw material') && !stepName.toLowerCase().includes('wire rod')) {
        deptsInDivision.add(stepName);
      }
    });

    // b. From departments list for this division
    departmentsList.forEach((d) => {
      const divId = d.division_id || d.divisionId;
      const isDivMatch = selectedDivision === 'all' || 
        divId === activeDivisionObj.id ||
        (selectedDivision === 'd1000000-0000-0000-0000-000000000001' && (d.name === 'Straightener' || d.name === 'Swagging' || d.name === 'Spoke' || d.name === 'Header' || d.name === 'Nipple' || d.name === 'Spoke Plating' || d.name === 'Nipple Plating' || d.name === 'Spoke Packing')) ||
        (selectedDivision === 'd1000000-0000-0000-0000-000000000002' && (d.name === 'Flattening' || d.name === 'Spiral' || d.name === 'PVC' || d.name === 'Cutting & Packing' || d.name === 'Packing'));
      
      const lowerName = d.name.toLowerCase();
      const isNonProduction = lowerName.includes('maintenance') || lowerName.includes('visitor') || lowerName.includes('facility') || (lowerName.includes('store') && !lowerName.includes('dispatch'));
      
      if (isDivMatch && !isNonProduction) {
        deptsInDivision.add(d.name);
      }
    });

    // c. From production entries for this division
    filteredProduction.forEach((r) => {
      if (r.departmentName) {
        deptsInDivision.add(r.departmentName);
      }
    });

    // If division is spoke and set is empty, fallback to canonical
    if (deptsInDivision.size === 0) {
      if (selectedDivision === 'd1000000-0000-0000-0000-000000000001' || activeDivisionObj.name.toLowerCase().includes('spoke')) {
        ['Straightener', 'Swagging', 'Spoke', 'Spoke Plating', 'Spoke Packing'].forEach(d => deptsInDivision.add(d));
      } else {
        ['Flattening', 'Spiral', 'PVC', 'Cutting & Packing'].forEach(d => deptsInDivision.add(d));
      }
    }

    const allActiveDeptNames = Array.from(deptsInDivision);

    // Helper to match a machine to its department
    const isMachineInDept = (machineDept: string, targetDept: string): boolean => {
      const mDept = (machineDept || '').toLowerCase().trim();
      const tDept = (targetDept || '').toLowerCase().trim();

      if (mDept === tDept) return true;

      // Exact substring or includes, but ensure no closer exact match in allActiveDeptNames
      if (mDept.includes(tDept) || tDept.includes(mDept)) {
        const hasMoreSpecificMatch = allActiveDeptNames.some((other) => {
          const oDept = other.toLowerCase().trim();
          return oDept !== tDept && (mDept === oDept || (mDept.includes(oDept) && oDept.length > tDept.length));
        });
        if (!hasMoreSpecificMatch) return true;
      }

      // Rollup handling for Spoke:
      // If targetDept is 'Spoke' and neither 'Header' nor 'Nipple' is an active department in table:
      if (tDept === 'spoke') {
        if ((mDept === 'header' || mDept.includes('header')) && !allActiveDeptNames.some(d => d.toLowerCase().includes('header'))) {
          return true;
        }
        if ((mDept === 'nipple' || mDept.includes('nipple')) && !allActiveDeptNames.some(d => d.toLowerCase().includes('nipple'))) {
          return true;
        }
      }

      // Rollup handling for Spoke Plating:
      // If targetDept is 'Spoke Plating' and 'Nipple Plating' is not in table:
      if (tDept.includes('plating') && mDept.includes('plating')) {
        if (!allActiveDeptNames.some(d => d.toLowerCase().trim() === mDept)) {
          return true;
        }
      }

      return false;
    };

    return allActiveDeptNames.map((dept) => {
      // Find all subMachines belonging to this department
      const subMachines = machineSummary.filter((m) => isMachineInDept(m.department, dept));

      // Calculate totals purely as the sum of its machines!
      const totalTarget = subMachines.reduce((sum, m) => sum + (m.totalTarget || 0), 0);
      const totalActual = subMachines.reduce((sum, m) => sum + (m.totalActual || 0), 0);
      const totalScrap = subMachines.reduce((sum, m) => sum + (m.totalScrap || 0), 0);
      const totalDowntime = subMachines.reduce((sum, m) => sum + (m.totalDowntime || 0), 0);
      const count = subMachines.reduce((sum, m) => sum + (m.count || 0), 0);

      const activeMachines = subMachines.filter((sm) => sm.totalActual > 0).length;
      const totalRegisteredMachines = subMachines.length;
      const machineList = subMachines
        .filter((sm) => sm.totalActual > 0)
        .map((sm) => sm.machineNo)
        .sort(naturalSortMachines)
        .join(', ');

      const variance = totalActual - totalTarget;
      const efficiency = totalTarget > 0 ? (totalActual / totalTarget) * 100 : (totalActual > 0 ? 100 : 0);
      const scrapRate = totalActual > 0 ? (totalScrap / totalActual) * 100 : 0;

      return {
        department: dept,
        divisionName: activeDivisionObj.name,
        unit: getDepartmentUnit(dept),
        machines: new Set(subMachines.map((sm) => sm.machineNo)),
        totalTarget,
        totalActual,
        totalScrap,
        totalDowntime,
        count,
        activeMachines,
        totalRegisteredMachines,
        machineList,
        variance,
        efficiency,
        scrapRate,
        subMachines,
      };
    })
    .sort((a, b) => getDeptOrder(a.department) - getDeptOrder(b.department));
  }, [activePipeline, departmentsList, filteredProduction, selectedDivision, activeDivisionObj, machineSummary, getDeptOrder]);

  // Horizontal Bar Chart Items with Target-Relative Attainment Scaling & Units
  const barChartItems: BarChartItem[] = useMemo(() => {
    if (selectedCategory === 'production') {
      const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444'];

      // 1. Shift-wise
      if (selectedReport === 'prod_shift' || groupBy === 'shift') {
        const maxVal = Math.max(...shiftSummary.map((s) => s.totalActual), 1);
        return shiftSummary.map((s, idx) => ({
          id: s.shift,
          label: s.shift,
          value: s.totalActual,
          target: s.totalTarget,
          unit: 'Qty',
          displayValue: `${formatDecimal(s.totalActual)} Qty`,
          sublabel: `Target: ${formatDecimal(s.totalTarget)} | Eff: ${formatDecimal(s.efficiency)}%`,
          color: colors[idx % colors.length],
          percentage: Math.min(100, Math.round((s.totalActual / maxVal) * 100)),
          efficiency: s.efficiency,
        }));
      }

      // 2. Operator-wise
      if (selectedReport === 'prod_operator' || groupBy === 'operator') {
        const maxVal = Math.max(...operatorSummary.map((o) => o.totalActual), 1);
        return operatorSummary.slice(0, 7).map((o, idx) => ({
          id: o.operator,
          label: o.operator,
          value: o.totalActual,
          target: o.totalTarget,
          unit: 'Qty',
          displayValue: `${formatDecimal(o.totalActual)} Qty`,
          sublabel: `Machines: ${o.machineList} | Eff: ${formatDecimal(o.efficiency)}%`,
          color: colors[idx % colors.length],
          percentage: Math.min(100, Math.round((o.totalActual / maxVal) * 100)),
          efficiency: o.efficiency,
        }));
      }

      // 3. Department-wise: Unit-Aware and Target-Relative Progress Scaling (Kg vs Meters)
      if (selectedReport === 'prod_department' || groupBy === 'department') {
        return departmentSummary.map((d, idx) => {
          const unit = d.unit || 'Qty';
          const eff = d.efficiency;
          return {
            id: d.department,
            label: `${d.department} (${d.divisionName})`,
            value: d.totalActual,
            target: d.totalTarget,
            unit,
            displayValue: `${formatDecimal(d.totalActual)} ${unit}`,
            sublabel: `Target: ${formatDecimal(d.totalTarget)} ${unit} | Eff: ${eff.toFixed(1)}% | ${d.activeMachines} lines`,
            color: colors[idx % colors.length],
            percentage: Math.min(100, Math.round(eff)),
            efficiency: eff,
          };
        });
      }

      // 4. Target vs Actual (Department-wise or Machine-wise based on targetSubView)
      if (selectedReport === 'prod_target_vs_actual') {
        if (targetSubView === 'department') {
          return departmentSummary.map((d, idx) => {
            const unit = d.unit || 'Qty';
            const eff = d.efficiency;
            return {
              id: d.department,
              label: `${d.department} (${d.divisionName})`,
              value: d.totalActual,
              target: d.totalTarget,
              unit,
              displayValue: `${formatDecimal(d.totalActual)} ${unit}`,
              sublabel: `Target: ${formatDecimal(d.totalTarget)} ${unit} | Var: ${d.variance >= 0 ? '+' : ''}${formatDecimal(d.variance)}`,
              color: colors[idx % colors.length],
              percentage: Math.min(100, Math.round(eff)),
              efficiency: eff,
            };
          });
        } else {
          // Machine-wise Target vs Actual
          const activeOrTargeted = machineSummary.filter((m) => m.totalActual > 0 || m.totalTarget > 0);
          return (activeOrTargeted.length > 0 ? activeOrTargeted : machineSummary).slice(0, 10).map((m, idx) => {
            const eff = m.efficiency;
            return {
              id: m.machineNo,
              label: `${m.machineName} (${m.machineNo})`,
              value: m.totalActual,
              target: m.totalTarget,
              unit: m.unit,
              displayValue: `${formatDecimal(m.totalActual)} ${m.unit}`,
              sublabel: `Target: ${formatDecimal(m.totalTarget)} ${m.unit} | Attainment: ${eff.toFixed(1)}%`,
              color: colors[idx % colors.length],
              percentage: Math.min(100, Math.round(eff)),
              efficiency: eff,
            };
          });
        }
      }

      // 5. Scrap & Rejection (Department-wise or Machine-wise based on scrapSubView)
      if (selectedReport === 'prod_scrap') {
        if (scrapSubView === 'department') {
          const maxVal = Math.max(...departmentSummary.map((d) => d.totalScrap), 1);
          return departmentSummary.map((d, idx) => ({
            id: d.department,
            label: `${d.department} (${d.divisionName})`,
            value: d.totalScrap,
            target: d.totalActual,
            unit: 'kg',
            displayValue: `${formatDecimal(d.totalScrap)} kg Scrap`,
            sublabel: `Produced: ${formatDecimal(d.totalActual)} ${d.unit} | Scrap Rate: ${d.scrapRate.toFixed(2)}%`,
            color: ['#ef4444', '#f97316', '#dc2626', '#b91c1c'][idx % 4],
            percentage: Math.min(100, Math.round((d.totalScrap / maxVal) * 100)),
            efficiency: d.scrapRate,
          }));
        } else {
          // Machine-wise scrap
          const activeScrap = machineSummary.filter((m) => m.totalScrap > 0 || m.totalActual > 0);
          const list = activeScrap.length > 0 ? activeScrap : machineSummary;
          const maxVal = Math.max(...list.map((m) => m.totalScrap), 1);
          return list.slice(0, 10).map((m, idx) => ({
            id: m.machineNo,
            label: `${m.machineName} (${m.machineNo})`,
            value: m.totalScrap,
            target: m.totalActual,
            unit: 'kg',
            displayValue: `${formatDecimal(m.totalScrap)} kg Scrap`,
            sublabel: `Downtime: ${m.totalDowntime}h | Scrap Rate: ${m.scrapRate.toFixed(2)}%`,
            color: ['#ef4444', '#f97316', '#e11d48', '#b91c1c', '#ea580c'][idx % 5],
            percentage: Math.min(100, Math.round((m.totalScrap / maxVal) * 100)),
            efficiency: m.scrapRate,
          }));
        }
      }

      // 6. Default / Machine-wise Output
      const activeMachines = machineSummary.filter((m) => m.totalActual > 0 || m.totalTarget > 0);
      return (activeMachines.length > 0 ? activeMachines : machineSummary).slice(0, 10).map((m, idx) => {
        const eff = m.efficiency;
        return {
          id: m.machineNo,
          label: `${m.machineName} (${m.machineNo})`,
          value: m.totalActual,
          target: m.totalTarget,
          unit: m.unit,
          displayValue: `${formatDecimal(m.totalActual)} ${m.unit}`,
          sublabel: `Target: ${formatDecimal(m.totalTarget)} ${m.unit} | Eff: ${eff.toFixed(1)}%`,
          color: colors[idx % colors.length],
          percentage: Math.min(100, Math.round(eff)),
          efficiency: eff,
        };
      });
    } else {
      // Group by Customer for Sales
      const custMap = new Map<string, number>();
      filteredSales.forEach((r) => {
        const curr = custMap.get(r.customerName) || 0;
        custMap.set(r.customerName, curr + r.totalAmount);
      });

      const maxVal = Math.max(...Array.from(custMap.values()), 1);
      const colors = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
      let i = 0;

      return Array.from(custMap.entries()).slice(0, 7).map(([label, total]) => ({
        id: label,
        label,
        value: total,
        displayValue: `Rs ${formatDecimal(total)}`,
        sublabel: 'Total Billed',
        color: colors[i++ % colors.length],
        percentage: Math.min(100, Math.round((total / maxVal) * 100)),
      }));
    }
  }, [
    selectedCategory, selectedReport, groupBy, targetSubView, scrapSubView,
    shiftSummary, operatorSummary, departmentSummary, machineSummary, filteredSales
  ]);

  // Dynamic Chart Header Info (Title, Icon, Legend)
  const chartHeaderInfo = useMemo(() => {
    if (selectedCategory === 'sales') {
      return {
        title: 'Customer Sales Volume Breakdown',
        icon: <LineChartOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />,
        legend: ['National Trading Corp', 'TechStart Pakistan', 'Metro Wholesale', 'Crown Group'],
      };
    }
    switch (selectedReport) {
      case 'prod_shift':
        return {
          title: 'Shift-wise Production Output & Efficiency Comparison',
          icon: <ClockCircleOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />,
          legend: ['Shift A (Morning)', 'Shift B (Afternoon)', 'Shift C (Night)', 'General Shift'],
        };
      case 'prod_operator':
        return {
          title: 'Operator Performance & Yield Benchmark',
          icon: <TeamOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />,
          legend: ['Hassan bilal', 'Imran Naveed', 'Muhammad Akram', 'Tariq Mehmood'],
        };
      case 'prod_department':
        return {
          title: 'Department-wise Production Output & Allocation',
          icon: <ApartmentOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />,
          legend: ['Control Cable Division', 'Spoke Division', 'Production Dept'],
        };
      case 'prod_target_vs_actual':
        return {
          title: `${targetSubView === 'machine' ? 'Machine-wise' : 'Department-wise'} Target vs Actual Variance Analysis`,
          icon: <SafetyCertificateOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />,
          legend: ['Achieved Yield', 'Target Baseline', 'Net Variance'],
        };
      case 'prod_scrap':
        return {
          title: `${scrapSubView === 'machine' ? 'Machine-wise' : 'Department-wise'} Scrap & Process Rejection Analysis`,
          icon: <FallOutlined style={{ color: '#ef4444' }} />,
          legend: ['Process Scrap (kg)', 'Downtime Hours', 'Rejection Rate %'],
        };
      case 'prod_machine':
      default:
        return {
          title: 'Machine-wise Production Output & Efficiency Benchmark',
          icon: <ToolOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />,
          legend: ['Flattening Machines', 'Straightener Lines', 'Spiral & Swaging'],
        };
    }
  }, [selectedCategory, selectedReport, targetSubView, scrapSubView]);

  // Report Meta Description
  const reportMeta = useMemo(() => {
    switch (selectedReport) {
      case 'prod_daily':
        return {
          title: 'Daily Production Report',
          desc: 'Live production entries, actual output, supervisor approval and machine yield rates.',
          icon: <RocketOutlined />,
        };
      case 'prod_machine':
        return {
          title: 'Machine-wise Production',
          desc: 'Performance metrics, running hours and output benchmarked across individual machines.',
          icon: <ToolOutlined />,
        };
      case 'prod_shift':
        return {
          title: 'Shift-wise Production',
          desc: 'Production comparison across Shift A (Morning), Shift B (Afternoon), Shift C (Night), and General Shift.',
          icon: <ClockCircleOutlined />,
        };
      case 'prod_operator':
        return {
          title: 'Operator-wise Production',
          desc: 'Yield and machine output benchmarked across lead operators and shift teams.',
          icon: <TeamOutlined />,
        };
      case 'prod_department':
        return {
          title: 'Department-wise Production',
          desc: 'Production flow grouped across plant departments and sections.',
          icon: <ApartmentOutlined />,
        };
      case 'prod_target_vs_actual':
        return {
          title: 'Target vs Actual Production & Variance',
          desc: 'Direct comparison between planned machine targets and actual achieved output.',
          icon: <SafetyCertificateOutlined />,
        };
      case 'prod_scrap':
        return {
          title: 'Scrap & Rejection Analysis',
          desc: 'Scrap quantity, waste percentage and non-conformance records per machine and operator.',
          icon: <FallOutlined />,
        };
      case 'sales_overview':
        return {
          title: 'Sales Overview',
          desc: 'What you billed, collected and are still owed — by day, customer or product.',
          icon: <LineChartOutlined />,
        };
      case 'sales_product':
        return {
          title: 'Product Sales',
          desc: 'Quantity, revenue, cost and gross profit for every wire and cable product sold.',
          icon: <ShoppingOutlined />,
        };
      case 'sales_customer':
        return {
          title: 'Customer Statement',
          desc: 'Invoice and payment ledger for individual buyers and registered distributors.',
          icon: <UserOutlined />,
        };
      default:
        return {
          title: selectedReport.replace(/_/g, ' ').toUpperCase(),
          desc: 'Live enterprise report powered by Supabase and PWI database.',
          icon: <PieChartOutlined />,
        };
    }
  }, [selectedReport]);

  // CSV Export
  const handleExportCsv = useCallback(() => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    const filename = `${selectedReport}_${detailMode}_${dayjs().format('YYYYMMDD_HHmm')}.csv`;

    if (selectedCategory === 'production') {
      if (detailMode === 'summary' && selectedReport === 'prod_shift') {
        headers = ['Shift', 'Target Qty', 'Actual Output', 'Variance', 'Rejection (Scrap kg)', 'Efficiency %', 'Running Hours', 'Downtime Hours', 'Entries'];
        rows = shiftSummary.map((s) => [
          `"${s.shift}"`, s.totalTarget, s.totalActual, s.variance, s.totalScrap, `${s.efficiency.toFixed(2)}%`, s.totalRunning, s.totalDowntime, s.count
        ]);
      } else if (detailMode === 'summary' && selectedReport === 'prod_operator') {
        headers = ['Operator', 'Supervisor', 'Assigned Machines', 'Target Qty', 'Actual Output', 'Variance', 'Scrap (kg)', 'Efficiency %', 'Entries'];
        rows = operatorSummary.map((o) => [
          `"${o.operator}"`, `"${o.supervisor}"`, `"${o.machineList}"`, o.totalTarget, o.totalActual, o.variance, o.totalScrap, `${o.efficiency.toFixed(2)}%`, o.count
        ]);
      } else if (detailMode === 'summary' && (selectedReport === 'prod_department' || (selectedReport === 'prod_target_vs_actual' && targetSubView === 'department') || (selectedReport === 'prod_scrap' && scrapSubView === 'department'))) {
        headers = ['Department', 'Division', 'Active Lines', 'Target Qty', 'Actual Output', 'Variance', 'Scrap (kg)', 'Scrap Rate %', 'Efficiency %', 'Downtime Hours'];
        rows = departmentSummary.map((d) => [
          `"${d.department}"`, `"${d.divisionName}"`, `"${d.machineList}"`, d.totalTarget, d.totalActual, d.variance, d.totalScrap, `${d.scrapRate.toFixed(2)}%`, `${d.efficiency.toFixed(2)}%`, d.totalDowntime
        ]);
      } else if (detailMode === 'summary' && (selectedReport === 'prod_machine' || (selectedReport === 'prod_target_vs_actual' && targetSubView === 'machine') || (selectedReport === 'prod_scrap' && scrapSubView === 'machine'))) {
        headers = ['Machine No', 'Machine Name', 'Division', 'Target Qty', 'Actual Output', 'Variance', 'Scrap (kg)', 'Scrap Rate %', 'Attainment %', 'Downtime Hours', 'Entries'];
        rows = machineSummary.map((m) => [
          m.machineNo, `"${m.machineName}"`, `"${m.divisionName}"`, m.totalTarget, m.totalActual, m.variance, m.totalScrap, `${m.scrapRate.toFixed(2)}%`, `${m.efficiency.toFixed(2)}%`, m.totalDowntime, m.count
        ]);
      } else {
        headers = [
          'Entry Number', 'Date', 'Machine No', 'Machine Name', 'Shift', 'Operator',
          'Supervisor', 'Division', 'Item Code', 'Item Name', 'Coil Size', 'Target Qty',
          'Actual Qty', 'Variance', 'Scrap (Rejection)', 'Efficiency %', 'Running Hours', 'Downtime Hours', 'Status'
        ];
        rows = filteredProduction.map((r) => [
          r.entryNumber, r.entryDate, r.machineNo, `"${r.machineName}"`, r.shiftName,
          `"${r.operatorName}"`, `"${r.supervisorName}"`, `"${r.divisionName}"`, r.itemCode,
          `"${r.itemName}"`, r.coilSize || '', r.targetQuantity, r.actualQuantity, r.varianceQuantity,
          r.scrapQuantity, `${r.efficiencyPercent}%`, r.runningHours, r.downtimeHours, r.status
        ]);
      }
    } else {
      headers = ['Invoice No', 'Customer Name', 'Customer Code', 'Invoice Date', 'Due Date', 'Subtotal', 'Tax (GST)', 'Total', 'Paid', 'Due', 'Status'];
      rows = filteredSales.map((r) => [
        r.invoiceNo, `"${r.customerName}"`, r.customerCode || '', r.invoiceDate, r.dueDate,
        r.subtotal, r.taxAmount, r.totalAmount, r.paidAmount, r.dueAmount, r.status
      ]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success(`Exported ${rows.length} records to ${filename}`);
  }, [selectedCategory, selectedReport, detailMode, targetSubView, scrapSubView, shiftSummary, operatorSummary, departmentSummary, machineSummary, filteredProduction, filteredSales]);

  return (
    <div className="reports-page-container">
      {/* ===================================================
          MASTER TOP BAR
          =================================================== */}
      <div className="reports-master-topbar">
        <div className="reports-topbar-left">
          <div className="reports-topbar-icon-box">
            <PieChartOutlined />
          </div>
          <div className="reports-topbar-title-wrap">
            <div className="reports-topbar-title">Reports</div>
            <div className="reports-topbar-breadcrumbs">
              <span>Home</span>
              <span>&gt;</span>
              <span>Insights</span>
              <span>&gt;</span>
              <span style={{ fontWeight: 700, color: 'var(--theme-accent, #10b981)' }}>
                {reportMeta.title}
              </span>
            </div>
          </div>
        </div>

        <div className="reports-topbar-right">
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
            className="reports-btn-primary-action"
          >
            Print A4
          </Button>

          <Tooltip title="Download PDF format">
            <Button
              icon={<FilePdfOutlined />}
              onClick={() => window.print()}
              className="reports-icon-btn"
            />
          </Tooltip>

          <Tooltip title="Export CSV spreadsheet">
            <Button
              icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
              onClick={handleExportCsv}
              className="reports-icon-btn"
            />
          </Tooltip>

          <Tooltip title="Refresh data from Supabase">
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => {
                void loadProductionData();
                void loadSalesData();
                message.success('Data synced with Supabase');
              }}
              className="reports-icon-btn"
            />
          </Tooltip>

          {/* REAL DIVISIONS FROM SUPABASE */}
          <Select
            value={selectedDivision}
            onChange={(val) => {
              setSelectedDivision(val);
              const found = divisionsList.find((d) => d.id === val);
              message.info(`Filtered for: ${val === 'all' ? 'All Divisions' : found?.name || val}`);
            }}
            className="reports-division-select"
            suffixIcon={<BranchesOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />}
          >
            <Select.Option value="all">🌐 All Divisions</Select.Option>
            {divisionsList.map((div) => (
              <Select.Option key={div.id} value={div.id}>
                {div.divisionCode ? `${div.divisionCode} - ` : ''}{div.name}
              </Select.Option>
            ))}
          </Select>

          {/* Search Box */}
          <Input
            placeholder="Search records..."
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
            allowClear
            style={{ width: 180 }}
            value={tableSearchText}
            onChange={(e) => setTableSearchText(e.target.value)}
          />
        </div>
      </div>

      {/* ===================================================
          MASTER GRID: Left Sidebar Navigation + Right Content
          =================================================== */}
      <div className="reports-layout-grid">
        {/* Left Navigation Sidebar */}
        <div className="reports-nav-sidebar">
          <div className="reports-nav-search">
            <Input
              size="small"
              placeholder="Search reports..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchNavText}
              onChange={(e) => setSearchNavText(e.target.value)}
              allowClear
            />
          </div>

          {/* PRODUCTION (MRP) - Directly from Supabase */}
          <div className="reports-nav-group-header prod-highlight">
            <RocketOutlined /> PRODUCTION (MRP)
          </div>

          <div
            className={`reports-nav-item ${selectedReport === 'prod_daily' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('production'); setSelectedReport('prod_daily'); setGroupBy('day'); setDetailMode('detailed'); }}
          >
            <CalendarOutlined /> Daily Production
            <span className="reports-nav-badge">{productionEntries.length}</span>
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'prod_machine' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('production'); setSelectedReport('prod_machine'); setGroupBy('machine'); setDetailMode('summary'); }}
          >
            <ToolOutlined /> Machine-wise
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'prod_shift' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('production'); setSelectedReport('prod_shift'); setGroupBy('shift'); setDetailMode('summary'); }}
          >
            <ClockCircleOutlined /> Shift-wise
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'prod_operator' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('production'); setSelectedReport('prod_operator'); setGroupBy('operator'); setDetailMode('summary'); }}
          >
            <TeamOutlined /> Operator-wise
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'prod_department' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('production'); setSelectedReport('prod_department'); setGroupBy('department'); setDetailMode('summary'); }}
          >
            <ApartmentOutlined /> Department-wise
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'prod_target_vs_actual' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('production'); setSelectedReport('prod_target_vs_actual'); setDetailMode('summary'); }}
          >
            <SafetyCertificateOutlined /> Target vs Actual
            <span className="reports-nav-badge">Variance</span>
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'prod_scrap' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('production'); setSelectedReport('prod_scrap'); setDetailMode('summary'); }}
          >
            <FallOutlined /> Scrap & Rejection
            <span className="reports-nav-badge">Scrap</span>
          </div>

          {/* SALES - Directly from Supabase */}
          <div className="reports-nav-group-header">
            <ShoppingOutlined /> SALES
          </div>

          <div
            className={`reports-nav-item ${selectedReport === 'sales_overview' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('sales'); setSelectedReport('sales_overview'); }}
          >
            <LineChartOutlined /> Sales Overview
            <span className="reports-nav-badge">{salesInvoices.length}</span>
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'sales_product' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('sales'); setSelectedReport('sales_product'); }}
          >
            <AppstoreOutlined /> Product Sales
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'sales_customer' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('sales'); setSelectedReport('sales_customer'); }}
          >
            <UserOutlined /> Customer Statement
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'sales_bill_profit' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('sales'); setSelectedReport('sales_bill_profit'); }}
          >
            <RiseOutlined /> Bill-wise Profit
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'sales_party_pl' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('sales'); setSelectedReport('sales_party_pl'); }}
          >
            <TeamOutlined /> Party-wise P&L
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'sales_category' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('sales'); setSelectedReport('sales_category'); }}
          >
            <ProjectOutlined /> By Category
          </div>

          {/* RECEIVABLES & PAYABLES */}
          <div className="reports-nav-group-header">
            <DollarOutlined /> RECEIVABLES & PAYABLES
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'rec_aging' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('receivables'); setSelectedReport('rec_aging'); }}
          >
            <ClockCircleOutlined /> Receivables Aging
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'pay_aging' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('receivables'); setSelectedReport('pay_aging'); }}
          >
            <ClockCircleOutlined /> Payables Aging
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'supplier_statement' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('receivables'); setSelectedReport('supplier_statement'); }}
          >
            <UserOutlined /> Supplier Statement
          </div>

          {/* INVENTORY */}
          <div className="reports-nav-group-header">
            <AppstoreOutlined /> INVENTORY
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'inv_stock' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('inventory'); setSelectedReport('inv_stock'); }}
          >
            <AppstoreOutlined /> Stock Summary
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'inv_valuation' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('inventory'); setSelectedReport('inv_valuation'); }}
          >
            <DollarOutlined /> Stock Valuation
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'inv_movement' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('inventory'); setSelectedReport('inv_movement'); }}
          >
            <SyncOutlined /> Stock Movement
          </div>

          {/* FINANCE */}
          <div className="reports-nav-group-header">
            <BankOutlined /> FINANCE
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'fin_pl' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('finance'); setSelectedReport('fin_pl'); }}
          >
            <BarChartOutlined /> Profit & Loss
          </div>
          <div
            className={`reports-nav-item ${selectedReport === 'fin_balance' ? 'active' : ''}`}
            onClick={() => { setSelectedCategory('finance'); setSelectedReport('fin_balance'); }}
          >
            <BankOutlined /> Balance Sheet
          </div>
        </div>

        {/* Right Main Content Workspace */}
        <div className="reports-main-workspace" id="printable-report-area">
          {/* Header Banner Card */}
          <div className="reports-banner-card">
            <div className="reports-banner-left">
              <div className="reports-banner-icon">
                {reportMeta.icon}
              </div>
              <div>
                <div className="reports-banner-title">{reportMeta.title}</div>
                <div className="reports-banner-desc">{reportMeta.desc}</div>
              </div>
            </div>

            <div className="reports-banner-date-badge">
              <CalendarOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
              <span>
                {fromDate ? fromDate.format('DD MMM YYYY') : '01 Sept 2026'} — {toDate ? toDate.format('DD MMM YYYY') : '30 Sept 2026'}
              </span>
            </div>
          </div>

          {/* Filter & Period Controls Strip */}
          <div className="reports-filter-strip no-print">
            <div className="reports-timeframe-pills">
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'all' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('all')}
              >
                All Records
              </button>
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'today' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('today')}
              >
                Today
              </button>
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'this_month' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('this_month')}
              >
                This month
              </button>
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'last_month' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('last_month')}
              >
                Last month
              </button>
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'this_quarter' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('this_quarter')}
              >
                This quarter
              </button>
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'last_quarter' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('last_quarter')}
              >
                Last quarter
              </button>
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'this_year' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('this_year')}
              >
                This year
              </button>
              <button
                type="button"
                className={`reports-time-pill ${timeframe === 'custom' ? 'active' : ''}`}
                onClick={() => handleTimeframeChange('custom')}
              >
                Custom
              </button>
            </div>

            {/* Sub-view switcher for Target vs Actual & Scrap / Rejection */}
            {(selectedReport === 'prod_target_vs_actual' || selectedReport === 'prod_scrap') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--theme-surface-alt, #f8fafc)', borderRadius: 6, border: '1px dashed var(--theme-border, #cbd5e1)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--theme-text-muted, #64748b)', letterSpacing: '0.5px' }}>
                  {selectedReport === 'prod_target_vs_actual' ? 'TARGET VIEW:' : 'REJECTION VIEW:'}
                </span>
                {selectedReport === 'prod_target_vs_actual' ? (
                  <>
                    <button
                      type="button"
                      className={`reports-time-pill ${targetSubView === 'machine' ? 'active' : ''}`}
                      onClick={() => { setTargetSubView('machine'); setGroupBy('machine'); }}
                    >
                      <ToolOutlined style={{ marginRight: 4 }} /> Machine-wise Target
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${targetSubView === 'department' ? 'active' : ''}`}
                      onClick={() => { setTargetSubView('department'); setGroupBy('department'); }}
                    >
                      <ApartmentOutlined style={{ marginRight: 4 }} /> Department-wise Target
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`reports-time-pill ${scrapSubView === 'machine' ? 'active' : ''}`}
                      onClick={() => { setScrapSubView('machine'); setGroupBy('machine'); }}
                    >
                      <ToolOutlined style={{ marginRight: 4 }} /> Machine-wise Scrap
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${scrapSubView === 'department' ? 'active' : ''}`}
                      onClick={() => { setScrapSubView('department'); setGroupBy('department'); }}
                    >
                      <ApartmentOutlined style={{ marginRight: 4 }} /> Department-wise Scrap
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="reports-filter-controls-row">
              <div className="reports-date-inputs-group">
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>From</span>
                <DatePicker
                  value={fromDate}
                  onChange={(d) => { setFromDate(d); setTimeframe('custom'); }}
                  format="MM/DD/YYYY"
                  size="small"
                  style={{ width: 130 }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>To</span>
                <DatePicker
                  value={toDate}
                  onChange={(d) => { setToDate(d); setTimeframe('custom'); }}
                  format="MM/DD/YYYY"
                  size="small"
                  style={{ width: 130 }}
                />
              </div>

              {/* Group By selector */}
              <div className="reports-groupby-group">
                <span className="reports-groupby-label">GROUP BY</span>
                {selectedCategory === 'production' ? (
                  <>
                    <button
                      type="button"
                      className={`reports-time-pill ${groupBy === 'day' ? 'active' : ''}`}
                      onClick={() => setGroupBy('day')}
                    >
                      Day
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${groupBy === 'machine' ? 'active' : ''}`}
                      onClick={() => setGroupBy('machine')}
                    >
                      Machine
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${groupBy === 'shift' ? 'active' : ''}`}
                      onClick={() => setGroupBy('shift')}
                    >
                      Shift
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${groupBy === 'operator' ? 'active' : ''}`}
                      onClick={() => setGroupBy('operator')}
                    >
                      Operator
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${groupBy === 'department' ? 'active' : ''}`}
                      onClick={() => setGroupBy('department')}
                    >
                      Department
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`reports-time-pill ${groupBy === 'day' ? 'active' : ''}`}
                      onClick={() => setGroupBy('day')}
                    >
                      Day
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${groupBy === 'customer' ? 'active' : ''}`}
                      onClick={() => setGroupBy('customer')}
                    >
                      Customer
                    </button>
                  </>
                )}
              </div>

              {/* Active Division Tag */}
              <Tag color="cyan" style={{ borderRadius: 4, fontWeight: 600, fontSize: 12, padding: '3px 8px' }}>
                <BranchesOutlined style={{ marginRight: 4 }} />
                {selectedDivision === 'all'
                  ? 'All Divisions Active'
                  : divisionsList.find((d) => d.id === selectedDivision)?.name || 'Filtered Division'}
              </Tag>
            </div>
          </div>

          {/* ===================================================
              DIVISION WORKFLOW ROADMAP PIPELINE (Operational Sequence)
              =================================================== */}
          {/* ===================================================
              DIVISION WORKFLOW ROADMAP PIPELINE (Operational Sequence)
              =================================================== */}
          <div className="reports-pipeline-roadmap no-print" style={{ marginBottom: 16 }}>
            <div className="reports-pipeline-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BranchesOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
                <span>
                  {activeDivisionObj.name} — Sequential Process Pipeline
                </span>
                {customSequences[activeDivisionObj.id] && (
                  <Tag color="cyan" style={{ fontSize: 10, margin: 0, padding: '0 6px', borderRadius: 4 }}>
                    Custom Sequence
                  </Tag>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  size="small"
                  icon={<SettingOutlined />}
                  onClick={handleOpenSeqModal}
                  style={{ fontSize: 11, fontWeight: 600, borderRadius: 4 }}
                >
                  Configure Sequence
                </Button>
                {customSequences[activeDivisionObj.id] && (
                  <Button
                    size="small"
                    danger
                    type="link"
                    icon={<ReloadOutlined />}
                    onClick={() => {
                      const updated = { ...customSequences };
                      delete updated[activeDivisionObj.id];
                      setCustomSequences(updated);
                      try {
                        localStorage.setItem('pwi_division_pipeline_seq_v2', JSON.stringify(updated));
                      } catch {}
                      message.success(`Reset ${activeDivisionObj.name} to factory standard sequence`);
                    }}
                    style={{ fontSize: 11, padding: 0 }}
                  >
                    Reset Factory
                  </Button>
                )}
              </div>
            </div>

            <div className="reports-pipeline-steps">
              {activePipeline.map((step, idx) => {
                const isDept = Boolean(step.departmentKey);
                const isSelected = selectedReport === 'prod_department' && groupBy === 'department';
                return (
                  <React.Fragment key={step.id || idx}>
                    {idx > 0 && <span className="reports-pipeline-arrow">➔</span>}
                    <div
                      className={`reports-pipeline-step ${isSelected && isDept ? 'active' : ''}`}
                      title={step.subtext ? `${step.name}: ${step.subtext}` : step.name}
                      onClick={() => {
                        if (isDept) {
                          setSelectedCategory('production');
                          setSelectedReport('prod_department');
                          setGroupBy('department');
                          setDetailMode('summary');
                        }
                      }}
                    >
                      <div className="reports-step-badge">{step.order || idx + 1}</div>
                      <div className="reports-step-content">
                        <span className="reports-step-title">{step.name}</span>
                        {step.subtext && <span className="reports-step-sub">{step.subtext}</span>}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* ===================================================
              REAL KPI SUMMARY METRIC CARDS
              =================================================== */}
          <Spin spinning={loading}>
            <div className="reports-kpi-grid">
              {selectedCategory === 'production' ? (
                <>
                  <div className="reports-kpi-card blue">
                    <div className="reports-kpi-title">TARGET PRODUCTION</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">{formatDecimal(prodSummary.totalTarget)}</span>
                      <span className="reports-kpi-trend positive">Planned</span>
                    </div>
                    <div className="reports-kpi-subtext">Sum of machine targets in period</div>
                  </div>

                  <div className="reports-kpi-card purple">
                    <div className="reports-kpi-title">ACTUAL PRODUCED</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">{formatDecimal(prodSummary.totalActual)}</span>
                      <span className={`reports-kpi-trend ${prodSummary.totalVariance >= 0 ? 'positive' : 'negative'}`}>
                        {prodSummary.totalVariance >= 0 ? `+${formatDecimal(prodSummary.totalVariance)}` : formatDecimal(prodSummary.totalVariance)}
                      </span>
                    </div>
                    <div className="reports-kpi-subtext">Net verified yield from entries</div>
                  </div>

                  <div className="reports-kpi-card green">
                    <div className="reports-kpi-title">PLANT EFFICIENCY</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">{formatDecimal(prodSummary.avgEfficiency)}%</span>
                      <span className="reports-kpi-trend positive">Average</span>
                    </div>
                    <div className="reports-kpi-subtext">Target attainment percentage</div>
                  </div>

                  <div className="reports-kpi-card red">
                    <div className="reports-kpi-title">TOTAL REJECTION / SCRAP</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">{formatDecimal(prodSummary.totalScrap)} kg</span>
                      <span className="reports-kpi-trend negative">{prodSummary.totalDowntime}h Downtime</span>
                    </div>
                    <div className="reports-kpi-subtext">Recorded process scrap in Supabase</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="reports-kpi-card blue">
                    <div className="reports-kpi-title">INVOICES</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">{salesSummary.count}</span>
                      <span className="reports-kpi-trend positive">Real Bills</span>
                    </div>
                    <div className="reports-kpi-subtext">Recorded sales invoices in Supabase</div>
                  </div>

                  <div className="reports-kpi-card purple">
                    <div className="reports-kpi-title">BILLED REVENUE</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">Rs {formatDecimal(salesSummary.totalBilled)}</span>
                      <span className="reports-kpi-trend positive">Gross</span>
                    </div>
                    <div className="reports-kpi-subtext">Total invoiced sales volume</div>
                  </div>

                  <div className="reports-kpi-card green">
                    <div className="reports-kpi-title">COLLECTED CASH</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">Rs {formatDecimal(salesSummary.totalPaid)}</span>
                      <span className="reports-kpi-trend positive">Cleared</span>
                    </div>
                    <div className="reports-kpi-subtext">Total payments received</div>
                  </div>

                  <div className="reports-kpi-card red">
                    <div className="reports-kpi-title">OUTSTANDING RECEIVABLE</div>
                    <div className="reports-kpi-value-row">
                      <span className="reports-kpi-value">Rs {formatDecimal(salesSummary.totalDue)}</span>
                      <span className="reports-kpi-trend neutral">Balance Due</span>
                    </div>
                    <div className="reports-kpi-subtext">Pending client settlement</div>
                  </div>
                </>
              )}
            </div>
          </Spin>

          {/* ===================================================
              INTERACTIVE VISUAL CHARTS (Multiple Pattern Switcher)
              =================================================== */}
          <div className="reports-chart-card">
            <div className="reports-chart-header">
              <div className="reports-chart-title">
                {chartHeaderInfo.icon}
                <span>{chartHeaderInfo.title}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Chart Type Selector */}
                {selectedReport !== 'sales_overview' && selectedReport !== 'prod_daily' && (
                  <div className="reports-chart-type-selector no-print">
                    <button
                      type="button"
                      className={`reports-chart-type-btn ${chartType === 'horizontal' ? 'active' : ''}`}
                      onClick={() => setChartType('horizontal')}
                      title="Horizontal Target Progress Bars"
                    >
                      <BarChartOutlined /> Bars
                    </button>
                    <button
                      type="button"
                      className={`reports-chart-type-btn ${chartType === 'column' ? 'active' : ''}`}
                      onClick={() => setChartType('column')}
                      title="Vertical Columns (Target vs Actual)"
                    >
                      <ProjectOutlined /> Columns
                    </button>
                    <button
                      type="button"
                      className={`reports-chart-type-btn ${chartType === 'donut' ? 'active' : ''}`}
                      onClick={() => setChartType('donut')}
                      title="Donut Distribution Chart"
                    >
                      <PieChartOutlined /> Donut
                    </button>
                    <button
                      type="button"
                      className={`reports-chart-type-btn ${chartType === 'efficiency' ? 'active' : ''}`}
                      onClick={() => setChartType('efficiency')}
                      title="Efficiency Attainment Grid"
                    >
                      <SafetyCertificateOutlined /> Attainment
                    </button>
                  </div>
                )}

                <div className="reports-chart-legend">
                  {chartHeaderInfo.legend.map((item, idx) => {
                    const legendColors = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
                    return (
                      <div key={item} className="reports-legend-item">
                        <span className="reports-legend-dot" style={{ backgroundColor: legendColors[idx % legendColors.length] }} />
                        <span>{item}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {selectedReport === 'sales_overview' || selectedReport === 'prod_daily' ? (
              <div className="reports-trend-chart-wrap">
                <svg className="reports-trend-svg" viewBox="0 0 800 220" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="trendGradientReal" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="var(--theme-accent, #10b981)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--theme-accent, #10b981)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  <line x1="40" y1="30" x2="780" y2="30" className="reports-trend-axis-line" />
                  <text x="10" y="34" className="reports-trend-axis-text">100%</text>

                  <line x1="40" y1="80" x2="780" y2="80" className="reports-trend-axis-line" />
                  <text x="10" y="84" className="reports-trend-axis-text">75%</text>

                  <line x1="40" y1="130" x2="780" y2="130" className="reports-trend-axis-line" />
                  <text x="10" y="134" className="reports-trend-axis-text">50%</text>

                  <line x1="40" y1="180" x2="780" y2="180" className="reports-trend-axis-line" />
                  <text x="10" y="184" className="reports-trend-axis-text">25%</text>

                  <path
                    d="M 60,140 C 180,170 260,150 380,90 C 500,60 620,105 740,50 L 740,200 L 60,200 Z"
                    fill="url(#trendGradientReal)"
                  />

                  <path
                    d="M 60,140 C 180,170 260,150 380,90 C 500,60 620,105 740,50"
                    className="reports-trend-curve"
                    stroke="var(--theme-accent, #10b981)"
                  />

                  <circle cx="60" cy="140" r="4.5" fill="#ffffff" stroke="var(--theme-accent, #10b981)" strokeWidth="2.5" className="reports-trend-dot" />
                  <circle cx="200" cy="160" r="4.5" fill="#ffffff" stroke="var(--theme-accent, #10b981)" strokeWidth="2.5" className="reports-trend-dot" />
                  <circle cx="380" cy="90" r="5" fill="#ffffff" stroke="var(--theme-accent, #10b981)" strokeWidth="2.5" className="reports-trend-dot" />
                  <circle cx="560" cy="80" r="4.5" fill="#ffffff" stroke="var(--theme-accent, #10b981)" strokeWidth="2.5" className="reports-trend-dot" />
                  <circle cx="740" cy="50" r="5" fill="#ffffff" stroke="var(--theme-accent, #10b981)" strokeWidth="2.5" className="reports-trend-dot" />

                  <text x="50" y="212" className="reports-trend-axis-text">01 Sept</text>
                  <text x="180" y="212" className="reports-trend-axis-text">08 Sept</text>
                  <text x="360" y="212" className="reports-trend-axis-text">15 Sept</text>
                  <text x="540" y="212" className="reports-trend-axis-text">22 Sept</text>
                  <text x="720" y="212" className="reports-trend-axis-text">30 Sept</text>
                </svg>
              </div>
            ) : chartType === 'column' ? (
              /* ALTERNATE PATTERN 1: SVG VERTICAL COLUMN CHART (Target vs Actual) */
              <div className="reports-columns-wrap">
                <svg className="reports-column-svg" viewBox="0 0 800 240">
                  <line x1="40" y1="20" x2="780" y2="20" stroke="var(--theme-border, #e2e8f0)" strokeDasharray="4 4" />
                  <line x1="40" y1="80" x2="780" y2="80" stroke="var(--theme-border, #e2e8f0)" strokeDasharray="4 4" />
                  <line x1="40" y1="140" x2="780" y2="140" stroke="var(--theme-border, #e2e8f0)" strokeDasharray="4 4" />
                  <line x1="40" y1="200" x2="780" y2="200" stroke="var(--theme-border, #cbd5e1)" strokeWidth="1.5" />

                  {barChartItems.map((item, idx) => {
                    const colWidth = Math.min(65, Math.floor(700 / (barChartItems.length || 1)));
                    const x = 60 + idx * (colWidth + 30);
                    const targetHeight = Math.min(170, Math.max(10, Math.round(((item.target || item.value) / (item.target || item.value || 1)) * 160)));
                    const actualHeight = Math.min(170, Math.max(6, Math.round((item.percentage / 100) * targetHeight)));
                    const yActual = 200 - actualHeight;
                    const yTarget = 200 - targetHeight;

                    return (
                      <g key={item.id}>
                        {/* Target baseline bar outline */}
                        <rect
                          x={x}
                          y={yTarget}
                          width={colWidth}
                          height={targetHeight}
                          fill="rgba(100, 116, 139, 0.08)"
                          stroke="rgba(100, 116, 139, 0.3)"
                          strokeDasharray="3 3"
                          rx="4"
                        />
                        {/* Actual yield filled bar */}
                        <rect
                          x={x + 4}
                          y={yActual}
                          width={colWidth - 8}
                          height={actualHeight}
                          fill={item.color}
                          rx="3"
                        />
                        {/* Percentage on top */}
                        <text
                          x={x + colWidth / 2}
                          y={yActual - 6}
                          textAnchor="middle"
                          fill="var(--theme-text, #0f172a)"
                          fontSize="11"
                          fontWeight="700"
                        >
                          {item.percentage}%
                        </text>
                        {/* Label at bottom */}
                        <text
                          x={x + colWidth / 2}
                          y={218}
                          textAnchor="middle"
                          fill="var(--theme-text-muted, #64748b)"
                          fontSize="11"
                          fontWeight="600"
                        >
                          {item.label.split(' ')[0]}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : chartType === 'donut' ? (
              /* ALTERNATE PATTERN 2: INTERACTIVE SVG DONUT / PIE DISTRIBUTION */
              <div className="reports-donut-wrap">
                <svg width="220" height="220" viewBox="0 0 220 220">
                  <circle cx="110" cy="110" r="75" fill="none" stroke="var(--theme-surface-alt, #f1f5f9)" strokeWidth="26" />
                  {(() => {
                    const totalVal = barChartItems.reduce((acc, it) => acc + (it.value || 0), 0) || 1;
                    const circumference = 2 * Math.PI * 75;
                    let accumulated = 0;

                    return barChartItems.map((it) => {
                      const share = (it.value || 0) / totalVal;
                      const strokeDasharray = `${share * circumference} ${circumference}`;
                      const strokeDashoffset = -accumulated * circumference;
                      accumulated += share;

                      return (
                        <circle
                          key={it.id}
                          cx="110"
                          cy="110"
                          r="75"
                          fill="none"
                          stroke={it.color}
                          strokeWidth="26"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          transform="rotate(-90 110 110)"
                          style={{ transition: 'stroke-dasharray 0.5s ease' }}
                        />
                      );
                    });
                  })()}
                  <text x="110" y="105" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--theme-text-muted, #64748b)">TOTAL YIELD</text>
                  <text x="110" y="125" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--theme-text, #0f172a)">
                    {formatDecimal(barChartItems.reduce((acc, it) => acc + (it.value || 0), 0))}
                  </text>
                </svg>

                <div className="reports-donut-legend">
                  {barChartItems.map((it) => {
                    const totalVal = barChartItems.reduce((acc, x) => acc + (x.value || 0), 0) || 1;
                    const share = Math.round(((it.value || 0) / totalVal) * 100);
                    return (
                      <div key={it.id} className="reports-donut-legend-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: it.color }} />
                          <span style={{ fontWeight: 600 }}>{it.label}</span>
                        </div>
                        <span style={{ fontWeight: 700 }}>
                          {it.displayValue} <Tag color="blue" style={{ fontSize: 10, marginLeft: 4 }}>{share}%</Tag>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : chartType === 'efficiency' ? (
              /* ALTERNATE PATTERN 3: EFFICIENCY ATTAINMENT GRID */
              <div className="reports-efficiency-grid">
                {barChartItems.map((it) => {
                  const eff = it.efficiency ?? it.percentage;
                  const circleBg = eff >= 95 ? '#10b981' : eff >= 75 ? '#2563eb' : eff > 0 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={it.id} className="reports-efficiency-card">
                      <div className="reports-efficiency-circle" style={{ backgroundColor: circleBg }}>
                        {eff.toFixed(0)}%
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #0f172a)' }}>{it.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
                        {it.displayValue} {it.target ? `/ ${formatDecimal(it.target)} ${it.unit || ''}` : ''}
                      </div>
                      <Tag color={eff >= 95 ? 'success' : eff >= 75 ? 'processing' : eff > 0 ? 'warning' : 'error'} style={{ marginTop: 4 }}>
                        {eff >= 95 ? 'Completed' : eff >= 75 ? 'On Track' : eff > 0 ? 'Delayed' : 'Idle / OFF'}
                      </Tag>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* DEFAULT PATTERN: HORIZONTAL TARGET PROGRESS BARS */
              <div className="reports-bars-container">
                {barChartItems.map((item) => (
                  <div key={item.id} className="reports-bar-row">
                    <div className="reports-bar-label-line">
                      <span>{item.label}</span>
                      <span style={{ fontWeight: 700 }}>
                        {item.displayValue} {item.sublabel && <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 500 }}>({item.sublabel})</span>}
                      </span>
                    </div>
                    <div className="reports-bar-track">
                      <div
                        className="reports-bar-fill"
                        style={{
                          width: `${item.percentage}%`,
                          backgroundColor: item.color,
                        }}
                      >
                        {item.percentage}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ===================================================
              REAL DATA RECORDS TABLE
              =================================================== */}
          <div className="reports-table-card">
            <div className="reports-table-header">
              <div className="reports-table-title">
                <BarChartOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
                <span>
                  {selectedCategory === 'production'
                    ? (detailMode === 'detailed' || selectedReport === 'prod_daily'
                        ? `Detailed Production Slips (${filteredProduction.length} entries from Supabase)`
                        : `${reportMeta.title} (${
                            selectedReport === 'prod_shift'
                              ? shiftSummary.length
                              : selectedReport === 'prod_operator'
                              ? operatorSummary.length
                              : selectedReport === 'prod_department' || (selectedReport === 'prod_target_vs_actual' && targetSubView === 'department') || (selectedReport === 'prod_scrap' && scrapSubView === 'department')
                              ? departmentSummary.length
                              : machineSummary.length
                          } rows)`)
                    : `Sales Records (${filteredSales.length} items from Supabase)`}
                </span>
              </div>

              <div className="reports-table-actions no-print">
                {selectedCategory === 'production' && selectedReport !== 'prod_daily' && (
                  <div style={{ display: 'inline-flex', gap: 4, marginRight: 8 }}>
                    <button
                      type="button"
                      className={`reports-time-pill ${detailMode === 'summary' ? 'active' : ''}`}
                      onClick={() => setDetailMode('summary')}
                    >
                      Summary Table
                    </button>
                    <button
                      type="button"
                      className={`reports-time-pill ${detailMode === 'detailed' ? 'active' : ''}`}
                      onClick={() => setDetailMode('detailed')}
                    >
                      Detailed Slips ({filteredProduction.length})
                    </button>
                  </div>
                )}
                <Button
                  size="small"
                  icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
                  onClick={handleExportCsv}
                >
                  Export CSV
                </Button>
              </div>
            </div>

            {selectedCategory === 'production' ? (
              detailMode === 'summary' && selectedReport === 'prod_shift' ? (
                /* 1. SHIFT-WISE SUMMARY TABLE */
                <Table
                  className="reports-data-table"
                  dataSource={shiftSummary}
                  rowKey="shift"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: 'Shift',
                      dataIndex: 'shift',
                      key: 'shift',
                      render: (s) => (
                        <Tag color={s.includes('A') ? 'blue' : s.includes('B') ? 'orange' : s.includes('Night') ? 'purple' : 'cyan'} style={{ fontWeight: 700, padding: '2px 8px' }}>
                          {s}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Target Qty',
                      dataIndex: 'totalTarget',
                      key: 'totalTarget',
                      render: (v) => formatDecimal(v),
                    },
                    {
                      title: 'Actual Output',
                      dataIndex: 'totalActual',
                      key: 'totalActual',
                      render: (v) => <strong style={{ color: 'var(--theme-text, #0f172a)' }}>{formatDecimal(v)}</strong>,
                    },
                    {
                      title: 'Variance',
                      dataIndex: 'variance',
                      key: 'variance',
                      render: (v) => (
                        <span style={{ fontWeight: 700, color: v >= 0 ? '#10b981' : '#ef4444' }}>
                          {v >= 0 ? `+${formatDecimal(v)}` : formatDecimal(v)}
                        </span>
                      ),
                    },
                    {
                      title: 'Rejection / Scrap',
                      dataIndex: 'totalScrap',
                      key: 'totalScrap',
                      render: (v) => <strong style={{ color: '#ef4444' }}>{formatDecimal(v)} kg</strong>,
                    },
                    {
                      title: 'Efficiency',
                      dataIndex: 'efficiency',
                      key: 'efficiency',
                      render: (v) => (
                        <Tag color={v >= 95 ? 'success' : v >= 75 ? 'processing' : 'error'}>
                          {formatDecimal(v)}%
                        </Tag>
                      ),
                    },
                    {
                      title: 'Running Hours',
                      dataIndex: 'totalRunning',
                      key: 'totalRunning',
                      render: (v) => `${v}h`,
                    },
                    {
                      title: 'Downtime',
                      dataIndex: 'totalDowntime',
                      key: 'totalDowntime',
                      render: (v) => `${v}h`,
                    },
                    {
                      title: 'Entries Count',
                      dataIndex: 'count',
                      key: 'count',
                      render: (c) => <Tag color="default">{c} slips</Tag>,
                    },
                  ]}
                />
              ) : detailMode === 'summary' && selectedReport === 'prod_operator' ? (
                /* 2. OPERATOR-WISE SUMMARY TABLE */
                <Table
                  className="reports-data-table"
                  dataSource={operatorSummary}
                  rowKey="operator"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: 'Lead Operator',
                      dataIndex: 'operator',
                      key: 'operator',
                      render: (op, row) => (
                        <div>
                          <div style={{ fontWeight: 700 }}>{op}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>Supervisor: {row.supervisor}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Machines Handled',
                      dataIndex: 'machineList',
                      key: 'machineList',
                      render: (m) => <Tag color="blue">{m || 'General Line'}</Tag>,
                    },
                    {
                      title: 'Total Target',
                      dataIndex: 'totalTarget',
                      key: 'totalTarget',
                      render: (v) => formatDecimal(v),
                    },
                    {
                      title: 'Total Produced',
                      dataIndex: 'totalActual',
                      key: 'totalActual',
                      render: (v) => <strong>{formatDecimal(v)}</strong>,
                    },
                    {
                      title: 'Variance',
                      dataIndex: 'variance',
                      key: 'variance',
                      render: (v) => (
                        <span style={{ fontWeight: 700, color: v >= 0 ? '#10b981' : '#ef4444' }}>
                          {v >= 0 ? `+${formatDecimal(v)}` : formatDecimal(v)}
                        </span>
                      ),
                    },
                    {
                      title: 'Rejection / Scrap',
                      dataIndex: 'totalScrap',
                      key: 'totalScrap',
                      render: (v) => <strong style={{ color: '#ef4444' }}>{formatDecimal(v)} kg</strong>,
                    },
                    {
                      title: 'Plant Efficiency',
                      dataIndex: 'efficiency',
                      key: 'efficiency',
                      render: (v) => (
                        <Tag color={v >= 95 ? 'success' : v >= 75 ? 'processing' : 'error'}>
                          {formatDecimal(v)}%
                        </Tag>
                      ),
                    },
                    {
                      title: 'Slips',
                      dataIndex: 'count',
                      key: 'count',
                      render: (c) => <Tag color="default">{c} entries</Tag>,
                    },
                  ]}
                />
              ) : detailMode === 'summary' && (selectedReport === 'prod_department' || (selectedReport === 'prod_target_vs_actual' && targetSubView === 'department') || (selectedReport === 'prod_scrap' && scrapSubView === 'department')) ? (
                /* 3. DEPARTMENT-WISE SUMMARY TABLE WITH EXPANDABLE (+) MACHINE BREAKDOWN */
                <Table
                  className="reports-data-table"
                  dataSource={departmentSummary}
                  rowKey="department"
                  pagination={false}
                  size="small"
                  expandable={{
                    expandedRowRender: (deptRecord) => (
                      <div className="reports-nested-subtable-wrap">
                        <div className="reports-nested-subtable-header">
                          <ToolOutlined />
                          <span>{deptRecord.department} — All Machine Production Breakdown ({deptRecord.subMachines.length} Lines Fleet)</span>
                        </div>
                        <Table
                          dataSource={deptRecord.subMachines}
                          rowKey="machineNo"
                          pagination={false}
                          size="small"
                          columns={[
                            {
                              title: 'Machine #',
                              dataIndex: 'machineNo',
                              key: 'machineNo',
                              width: 120,
                              render: (no) => <Tag color="blue" style={{ fontWeight: 700 }}>{no}</Tag>,
                            },
                            {
                              title: 'Machine Name',
                              dataIndex: 'machineName',
                              key: 'machineName',
                              render: (name) => <strong style={{ color: 'var(--theme-text, #0f172a)' }}>{name}</strong>,
                            },
                            {
                              title: `Target (${deptRecord.unit})`,
                              dataIndex: 'totalTarget',
                              key: 'totalTarget',
                              render: (v) => `${formatDecimal(v)} ${deptRecord.unit}`,
                            },
                            {
                              title: `Actual Output (${deptRecord.unit})`,
                              dataIndex: 'totalActual',
                              key: 'totalActual',
                              render: (v) => <strong>{formatDecimal(v)} {deptRecord.unit}</strong>,
                            },
                            {
                              title: 'Variance',
                              dataIndex: 'variance',
                              key: 'variance',
                              render: (v) => (
                                <span style={{ fontWeight: 700, color: v >= 0 ? '#10b981' : '#ef4444' }}>
                                  {v >= 0 ? `+${formatDecimal(v)}` : formatDecimal(v)}
                                </span>
                              ),
                            },
                            {
                              title: 'Rejection / Scrap',
                              dataIndex: 'totalScrap',
                              key: 'totalScrap',
                              render: (v) => <span style={{ color: '#ef4444', fontWeight: 600 }}>{formatDecimal(v)} kg</span>,
                            },
                            {
                              title: 'Efficiency',
                              dataIndex: 'efficiency',
                              key: 'efficiency',
                              render: (v, row) => (
                                <Tag color={row.count === 0 ? 'default' : v >= 95 ? 'success' : v >= 75 ? 'processing' : 'error'}>
                                  {row.count === 0 ? '100% OFF (0%)' : `${formatDecimal(v)}%`}
                                </Tag>
                              ),
                            },
                            {
                              title: 'Hours / Downtime',
                              key: 'hours',
                              render: (_, row) => `${row.totalRunning}h / ${row.totalDowntime}h`,
                            },
                            {
                              title: 'Remarks / Notes',
                              dataIndex: 'remarks',
                              key: 'remarks',
                              render: (rem: string | undefined, row: any) => {
                                if (row.count === 0) {
                                  return (
                                    <span style={{ fontStyle: 'italic', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                                      Idle — No production logged
                                    </span>
                                  );
                                }
                                if (rem && rem.trim()) {
                                  return (
                                    <span style={{ color: 'var(--theme-text, #0f172a)', fontSize: 12, fontWeight: 500 }}>
                                      {rem}
                                    </span>
                                  );
                                }
                                return (
                                  <span style={{ color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                                    {row.efficiency >= 95 ? 'Target attained smoothly' : 'Running normal'}
                                  </span>
                                );
                              },
                            },
                            {
                              title: 'Status',
                              dataIndex: 'status',
                              key: 'status',
                              render: (st) => (
                                <Tag color={st === 'Completed' ? 'green' : st === 'On Track' ? 'blue' : st === 'Delayed' ? 'orange' : 'magenta'}>
                                  {st}
                                </Tag>
                              ),
                            },
                          ]}
                        />
                      </div>
                    ),
                    rowExpandable: (record) => Array.isArray(record.subMachines) && record.subMachines.length > 0,
                  }}
                  columns={[
                    {
                      title: 'Department',
                      dataIndex: 'department',
                      key: 'department',
                      render: (d, row) => (
                        <div>
                          <div style={{ fontWeight: 700 }}>{d}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>{row.divisionName} • Unit: {row.unit}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Active Lines',
                      dataIndex: 'machineList',
                      key: 'machineList',
                      render: (m, row) => (
                        <span>
                          <strong>{row.activeMachines}</strong> active / {row.totalRegisteredMachines} lines
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>({m || 'No active slips'})</div>
                        </span>
                      ),
                    },
                    {
                      title: 'Target Qty',
                      dataIndex: 'totalTarget',
                      key: 'totalTarget',
                      render: (v, row) => `${formatDecimal(v)} ${row.unit}`,
                    },
                    {
                      title: 'Actual Output',
                      dataIndex: 'totalActual',
                      key: 'totalActual',
                      render: (v, row) => <strong>{formatDecimal(v)} {row.unit}</strong>,
                    },
                    {
                      title: 'Variance',
                      dataIndex: 'variance',
                      key: 'variance',
                      render: (v, row) => (
                        <span style={{ fontWeight: 700, color: v >= 0 ? '#10b981' : '#ef4444' }}>
                          {v >= 0 ? `+${formatDecimal(v)}` : formatDecimal(v)} {row.unit}
                        </span>
                      ),
                    },
                    {
                      title: 'Rejection / Scrap',
                      dataIndex: 'totalScrap',
                      key: 'totalScrap',
                      render: (v) => <strong style={{ color: '#ef4444' }}>{formatDecimal(v)} kg</strong>,
                    },
                    {
                      title: selectedReport === 'prod_scrap' ? 'Scrap Rate' : 'Efficiency',
                      key: 'rateOrEff',
                      render: (_, row) => (
                        <Tag color={selectedReport === 'prod_scrap' ? (row.scrapRate > 5 ? 'error' : row.scrapRate > 2 ? 'warning' : 'success') : (row.efficiency >= 95 ? 'success' : row.efficiency >= 75 ? 'processing' : 'error')}>
                          {selectedReport === 'prod_scrap' ? `${row.scrapRate.toFixed(2)}%` : `${formatDecimal(row.efficiency)}%`}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Downtime',
                      dataIndex: 'totalDowntime',
                      key: 'totalDowntime',
                      render: (v) => `${v}h`,
                    },
                  ]}
                />
              ) : detailMode === 'summary' && (selectedReport === 'prod_machine' || (selectedReport === 'prod_target_vs_actual' && targetSubView === 'machine') || (selectedReport === 'prod_scrap' && scrapSubView === 'machine')) ? (
                /* 4. MACHINE-WISE SUMMARY TABLE (Target / Scrap / Machine Fleet) */
                <Table
                  className="reports-data-table"
                  dataSource={machineSummary}
                  rowKey="machineNo"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: 'Machine',
                      dataIndex: 'machineName',
                      key: 'machineName',
                      render: (name, row) => (
                        <div>
                          <div style={{ fontWeight: 700 }}>{name}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>{row.machineNo} • {row.department} • {row.divisionName}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Target Qty',
                      dataIndex: 'totalTarget',
                      key: 'totalTarget',
                      render: (v, row) => `${formatDecimal(v)} ${row.unit}`,
                    },
                    {
                      title: 'Actual Output',
                      dataIndex: 'totalActual',
                      key: 'totalActual',
                      render: (v, row) => <strong>{formatDecimal(v)} {row.unit}</strong>,
                    },
                    {
                      title: 'Variance',
                      dataIndex: 'variance',
                      key: 'variance',
                      render: (v, row) => (
                        <span style={{ fontWeight: 700, color: v >= 0 ? '#10b981' : '#ef4444' }}>
                          {v >= 0 ? `+${formatDecimal(v)}` : formatDecimal(v)} {row.unit}
                        </span>
                      ),
                    },
                    {
                      title: 'Rejection / Scrap',
                      dataIndex: 'totalScrap',
                      key: 'totalScrap',
                      render: (v) => <strong style={{ color: '#ef4444' }}>{formatDecimal(v)} kg</strong>,
                    },
                    {
                      title: selectedReport === 'prod_scrap' ? 'Scrap Rate' : 'Attainment',
                      key: 'rateOrAttainment',
                      render: (_, row) => (
                        <Tag color={row.count === 0 ? 'default' : selectedReport === 'prod_scrap' ? (row.scrapRate > 5 ? 'error' : row.scrapRate > 2 ? 'warning' : 'success') : (row.efficiency >= 95 ? 'success' : row.efficiency >= 75 ? 'processing' : 'error')}>
                          {row.count === 0 ? '100% OFF (0%)' : selectedReport === 'prod_scrap' ? `${row.scrapRate.toFixed(2)}%` : `${formatDecimal(row.efficiency)}%`}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Downtime',
                      dataIndex: 'totalDowntime',
                      key: 'totalDowntime',
                      render: (v) => `${v}h`,
                    },
                    {
                      title: 'Remarks / Notes',
                      dataIndex: 'remarks',
                      key: 'remarks',
                      render: (rem: string | undefined, row: any) => {
                        if (row.count === 0) {
                          return (
                            <span style={{ fontStyle: 'italic', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                              Idle — No production logged
                            </span>
                          );
                        }
                        if (rem && rem.trim()) {
                          return (
                            <span style={{ color: 'var(--theme-text, #0f172a)', fontSize: 12, fontWeight: 500 }}>
                              {rem}
                            </span>
                          );
                        }
                        return (
                          <span style={{ color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                            {row.efficiency >= 95 ? 'Target attained smoothly' : 'Running normal'}
                          </span>
                        );
                      },
                    },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      key: 'status',
                      render: (st, row) => (
                        <Tag color={row.count === 0 ? 'magenta' : st === 'Completed' ? 'green' : st === 'On Track' ? 'blue' : 'orange'}>
                          {row.count === 0 ? 'Idle / OFF' : `${row.count} slips (${st})`}
                        </Tag>
                      ),
                    },
                  ]}
                />
              ) : (
                /* 5. FULL DETAILED PRODUCTION SLIPS TABLE (Default & Detailed Mode) */
                <Table
                  className="reports-data-table"
                  dataSource={filteredProduction}
                  rowKey="id"
                  pagination={{ pageSize: 8, showSizeChanger: false }}
                  size="small"
                  summary={() => (
                    <Table.Summary.Row className="reports-total-summary-row">
                      <Table.Summary.Cell index={0}>TOTAL</Table.Summary.Cell>
                      <Table.Summary.Cell index={1}>-</Table.Summary.Cell>
                      <Table.Summary.Cell index={2}>-</Table.Summary.Cell>
                      <Table.Summary.Cell index={3}>-</Table.Summary.Cell>
                      <Table.Summary.Cell index={4}><strong>{formatDecimal(prodSummary.totalTarget)}</strong></Table.Summary.Cell>
                      <Table.Summary.Cell index={5}><strong>{formatDecimal(prodSummary.totalActual)}</strong></Table.Summary.Cell>
                      <Table.Summary.Cell index={6}>
                        <span style={{ color: prodSummary.totalVariance >= 0 ? '#10b981' : '#ef4444' }}>
                          {prodSummary.totalVariance >= 0 ? `+${formatDecimal(prodSummary.totalVariance)}` : formatDecimal(prodSummary.totalVariance)}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={7}>
                        <strong style={{ color: '#ef4444' }}>{formatDecimal(prodSummary.totalScrap)} kg</strong>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={8}><strong>{formatDecimal(prodSummary.avgEfficiency)}%</strong></Table.Summary.Cell>
                      <Table.Summary.Cell index={9}>-</Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                  columns={[
                    {
                      title: 'Entry #',
                      dataIndex: 'entryNumber',
                      key: 'entryNumber',
                      width: 130,
                      render: (text, row) => (
                        <div>
                          <strong style={{ color: 'var(--theme-accent, #10b981)' }}>{text}</strong>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>{dayjs(row.entryDate).format('DD MMM YYYY')}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Machine',
                      dataIndex: 'machineName',
                      key: 'machineName',
                      render: (text, row) => (
                        <div>
                          <div style={{ fontWeight: 700 }}>{text}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>{row.machineNo} • {row.divisionName}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Shift',
                      dataIndex: 'shiftName',
                      key: 'shiftName',
                      width: 140,
                      render: (s) => (
                        <Tag color={s.includes('A') ? 'blue' : s.includes('B') ? 'orange' : s.includes('Night') ? 'purple' : 'cyan'}>
                          {s}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Operator',
                      dataIndex: 'operatorName',
                      key: 'operatorName',
                      render: (op, row) => (
                        <div>
                          <div>{op}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>Sup: {row.supervisorName}</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Target',
                      dataIndex: 'targetQuantity',
                      key: 'targetQuantity',
                      render: (v) => formatDecimal(v),
                    },
                    {
                      title: 'Actual',
                      dataIndex: 'actualQuantity',
                      key: 'actualQuantity',
                      render: (v) => <strong style={{ color: 'var(--theme-text, #0f172a)' }}>{formatDecimal(v)}</strong>,
                    },
                    {
                      title: 'Variance',
                      dataIndex: 'varianceQuantity',
                      key: 'varianceQuantity',
                      render: (v) => (
                        <span style={{ fontWeight: 700, color: v >= 0 ? '#10b981' : '#ef4444' }}>
                          {v >= 0 ? `+${formatDecimal(v)}` : formatDecimal(v)}
                        </span>
                      ),
                    },
                    {
                      title: 'Rejection / Scrap',
                      dataIndex: 'scrapQuantity',
                      key: 'scrapQuantity',
                      render: (v, row) => (
                        <div>
                          <strong style={{ color: '#ef4444' }}>{formatDecimal(v)} kg</strong>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>Down: {row.downtimeHours}h</div>
                        </div>
                      ),
                    },
                    {
                      title: 'Efficiency',
                      dataIndex: 'efficiencyPercent',
                      key: 'efficiencyPercent',
                      render: (v) => (
                        <Tag color={v >= 95 ? 'success' : v >= 75 ? 'processing' : 'error'}>
                          {formatDecimal(v)}%
                        </Tag>
                      ),
                    },
                    {
                      title: 'Remarks / Notes',
                      dataIndex: 'remarks',
                      key: 'remarks',
                      render: (rem) => rem ? (
                        <span style={{ fontSize: 12, color: 'var(--theme-text, #0f172a)' }}>{rem}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', fontStyle: 'italic' }}>-</span>
                      ),
                    },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      key: 'status',
                      render: (st) => (
                        <Tag color={st === 'Completed' ? 'green' : st === 'On Track' ? 'blue' : 'warning'}>
                          {st}
                        </Tag>
                      ),
                    },
                  ]}
                />
              )
            ) : (
              <Table
                className="reports-data-table"
                dataSource={filteredSales}
                rowKey="id"
                pagination={{ pageSize: 8, showSizeChanger: false }}
                size="small"
                summary={() => (
                  <Table.Summary.Row className="reports-total-summary-row">
                    <Table.Summary.Cell index={0}>TOTAL</Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>-</Table.Summary.Cell>
                    <Table.Summary.Cell index={2}>-</Table.Summary.Cell>
                    <Table.Summary.Cell index={3}>-</Table.Summary.Cell>
                    <Table.Summary.Cell index={4}>
                      <strong>Rs {formatDecimal(salesSummary.totalBilled)}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5}>
                      <strong style={{ color: '#10b981' }}>Rs {formatDecimal(salesSummary.totalPaid)}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6}>
                      <strong style={{ color: '#ef4444' }}>Rs {formatDecimal(salesSummary.totalDue)}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7}>-</Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
                columns={[
                  {
                    title: 'Invoice #',
                    dataIndex: 'invoiceNo',
                    key: 'invoiceNo',
                    render: (v) => <strong style={{ color: 'var(--theme-accent, #10b981)' }}>{v}</strong>,
                  },
                  {
                    title: 'Customer',
                    dataIndex: 'customerName',
                    key: 'customerName',
                    render: (c, row) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{c}</div>
                        {row.customerCode && <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>{row.customerCode}</div>}
                      </div>
                    ),
                  },
                  {
                    title: 'Date',
                    dataIndex: 'invoiceDate',
                    key: 'invoiceDate',
                    render: (d) => dayjs(d).format('DD MMM YYYY'),
                  },
                  {
                    title: 'Due Date',
                    dataIndex: 'dueDate',
                    key: 'dueDate',
                    render: (d) => dayjs(d).format('DD MMM YYYY'),
                  },
                  {
                    title: 'Total (Rs)',
                    dataIndex: 'totalAmount',
                    key: 'totalAmount',
                    render: (v) => `Rs ${formatDecimal(v)}`,
                  },
                  {
                    title: 'Paid (Rs)',
                    dataIndex: 'paidAmount',
                    key: 'paidAmount',
                    render: (v) => <span style={{ color: '#10b981', fontWeight: 600 }}>Rs {formatDecimal(v)}</span>,
                  },
                  {
                    title: 'Due (Rs)',
                    dataIndex: 'dueAmount',
                    key: 'dueAmount',
                    render: (v) => (
                      <span style={{ color: v > 0 ? '#ef4444' : 'var(--theme-text-muted, #94a3b8)', fontWeight: v > 0 ? 700 : 400 }}>
                        Rs {formatDecimal(v)}
                      </span>
                    ),
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    render: (st) => (
                      <Tag color={st === 'Paid' ? 'green' : st === 'Partial' ? 'orange' : st === 'Draft' ? 'default' : 'red'}>
                        {st.toUpperCase()}
                      </Tag>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* ===================================================
          PROCESS SEQUENCE CONFIGURATION MODAL
          =================================================== */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SettingOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            <span>Configure Process Sequence — {activeDivisionObj.name}</span>
          </div>
        }
        open={isSeqModalOpen}
        onCancel={() => setIsSeqModalOpen(false)}
        width={700}
        footer={[
          <Button key="factory" onClick={handleResetFactory} icon={<ReloadOutlined />} style={{ float: 'left' }}>
            Reset Factory Default
          </Button>,
          <Button key="cancel" onClick={() => setIsSeqModalOpen(false)}>
            Cancel
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveSequence} icon={<CheckCircleOutlined />}>
            Save Sequence & Apply
          </Button>,
        ]}
      >
        <div className="reports-seq-modal-desc" style={{ marginBottom: 16 }}>
          All active departments for <strong>{activeDivisionObj.name}</strong> are listed below in sequential order. Use <strong>▲ Up</strong> / <strong>▼ Down</strong> to adjust the pipeline flow, or remove any unneeded stage. Once saved, this order is permanently applied across all reports.
        </div>

        {/* 1. Active Sequential Pipeline (Numbered Steps 1..N) */}
        <div className="reports-seq-section-title">
          <span>Active Sequential Pipeline ({editingSteps.length} Steps)</span>
          <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 500 }}>
            Top = 1st Step ➔ Bottom = Final Step
          </span>
        </div>
        <div className="reports-seq-step-list">
          {editingSteps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--theme-text-muted, #94a3b8)' }}>
              No departments in sequence. Click Reset Factory Default or add a step below.
            </div>
          ) : (
            editingSteps.map((step, idx) => (
              <div key={step.id || idx} className="reports-seq-step-row">
                <div className="reports-seq-step-left">
                  <div className="reports-seq-step-num">{idx + 1}</div>
                  <div className="reports-seq-step-info">
                    <span className="reports-seq-step-name">{step.name}</span>
                    <span className="reports-seq-step-sub">{step.subtext || (step.unit ? `Unit: ${step.unit}` : `Step #${idx + 1}`)}</span>
                  </div>
                </div>

                <div className="reports-seq-step-controls">
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={idx === 0}
                    onClick={() => handleMoveStep(idx, 'up')}
                    title="Move earlier in sequence"
                  />
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={idx === editingSteps.length - 1}
                    onClick={() => handleMoveStep(idx, 'down')}
                    title="Move later in sequence"
                  />
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveStep(idx)}
                    title="Remove from sequence"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* 2. Excluded / Available Division Departments */}
        {excludedDivisionDepartments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="reports-seq-section-title">
              <span>Available / Excluded Division Departments</span>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 500 }}>
                Click to add back into sequence
              </span>
            </div>
            <div className="reports-seq-unassigned-wrap">
              {excludedDivisionDepartments.map((dept) => (
                <div
                  key={dept.id || dept.name}
                  className="reports-seq-dept-chip"
                  onClick={() => handleAssignDepartmentStep(dept.name)}
                  title={`Click to re-add ${dept.name} to sequence`}
                >
                  <PlusOutlined style={{ color: '#10b981' }} />
                  <span>{dept.name}</span>
                  <Tag color="green" style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
                    + Add
                  </Tag>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Add Custom Stage Trigger Button */}
        <div style={{ marginTop: 16 }}>
          <Button
            type="dashed"
            icon={<PlusCircleOutlined />}
            onClick={() => setIsAddStageModalOpen(true)}
            block
            style={{ height: 38, fontWeight: 600 }}
          >
            + Add Custom Process Stage / Department
          </Button>
        </div>
      </Modal>

      {/* ===================================================
          SUB-MODAL: ADD CUSTOM PROCESS STAGE / DEPARTMENT
          =================================================== */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PlusCircleOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            <span>Add Custom Process Stage / Department</span>
          </div>
        }
        open={isAddStageModalOpen}
        onCancel={() => {
          setIsAddStageModalOpen(false);
          setCustomStageName('');
          setCustomStageSubtext('');
        }}
        onOk={handleConfirmAddCustomStage}
        okText="Add to Pipeline"
        cancelText="Cancel"
        destroyOnClose
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: 'var(--theme-text, #f1f5f9)' }}>
              Stage / Department Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              placeholder="e.g. Zinc Plating, Quality Gate, Rewinding"
              value={customStageName}
              onChange={(e) => setCustomStageName(e.target.value)}
              onPressEnter={handleConfirmAddCustomStage}
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: 'var(--theme-text, #f1f5f9)' }}>
              Process Description / Subtext (Optional)
            </label>
            <Input
              placeholder="e.g. Surface coating bath, Final inspection"
              value={customStageSubtext}
              onChange={(e) => setCustomStageSubtext(e.target.value)}
              onPressEnter={handleConfirmAddCustomStage}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: 'var(--theme-text, #f1f5f9)' }}>
              Unit of Measurement
            </label>
            <Select
              value={customStageUnit}
              onChange={(val) => setCustomStageUnit(val)}
              style={{ width: '100%' }}
              options={[
                { value: 'Gross (144 Pcs)', label: 'Gross (144 Pcs)' },
                { value: 'Pcs', label: 'Pieces (Pcs)' },
                { value: 'kg', label: 'Kilograms (kg)' },
                { value: 'Mtr', label: 'Meters (Mtr)' },
                { value: 'Boxes', label: 'Boxes' },
                { value: 'Coils', label: 'Coils' },
                { value: 'Sets', label: 'Sets' },
                { value: 'Qty', label: 'Quantity (General)' },
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default GeneralReports;
