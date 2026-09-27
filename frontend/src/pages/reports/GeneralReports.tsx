import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Button, Select, DatePicker, Table, Tag, Modal, Space,
  Tooltip, message,
} from 'antd';
import {
  PieChartOutlined, PrinterOutlined, FileExcelOutlined,
  CalendarOutlined, FilterOutlined, CloseCircleOutlined,
  CaretRightOutlined, InfoCircleOutlined, DownloadOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { formatDecimal } from '../../utils/numberFormat';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import './GeneralReports.css';

type ReportType =
  | 'sales'
  | 'purchases'
  | 'product_sales'
  | 'customer_sales'
  | 'product_margin'
  | 'customer_margin';

interface SalesRow {
  id: string;
  invoice: string;
  customer: string;
  date: string;
  itemsCount: number;
  itemsDesc: string;
  totalQty: number;
  uom: string;
  status: 'paid' | 'pending' | 'partial';
  subtotal: number;
  gst: number;
  total: number;
  paid: number;
  due: number;
}

interface PurchaseRow {
  id: string;
  po: string;
  supplier: string;
  date: string;
  itemsCount: number;
  itemsDesc: string;
  totalQty: number;
  uom: string;
  status: 'received' | 'pending';
  subtotal: number;
  gst: number;
  total: number;
  paid: number;
  due: number;
}

interface ProductSalesRow {
  id: string;
  productCode: string;
  productName: string;
  category: string;
  qtySold: number;
  unitPrice: number;
  subtotal: number;
  gst: number;
  total: number;
}

interface CustomerSalesRow {
  id: string;
  customerCode: string;
  customerName: string;
  invoicesCount: number;
  itemsCount: number;
  totalQty: number;
  subtotal: number;
  gst: number;
  total: number;
  paid: number;
  due: number;
}

interface ProductMarginRow {
  id: string;
  productCode: string;
  productName: string;
  sellingPrice: number;
  costPrice: number;
  marginAmount: number;
  marginPercent: number;
}

interface CustomerMarginRow {
  id: string;
  customerCode: string;
  customerName: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPercent: number;
}

const DEFAULT_SALES_DATA: SalesRow[] = [
  { id: '1', invoice: 'INV-0005', customer: 'Customer 1', date: '2026-08-24', itemsCount: 2, itemsDesc: 'High Tensile Wire 2.5mm (20 kg), Binding Wire (10 kg)', totalQty: 30, uom: 'kg', status: 'paid', subtotal: 850.00, gst: 142.20, total: 1732.00, paid: 1732.00, due: 0.00 },
  { id: '2', invoice: 'INV-0004', customer: 'Customer 1', date: '2026-08-16', itemsCount: 3, itemsDesc: 'Copper Conductor 4mm (35 m), Alloy Wire Rod (20 kg)', totalQty: 55, uom: 'Units', status: 'pending', subtotal: 1400.00, gst: 252.00, total: 1652.00, paid: 0.00, due: 1652.00 },
  { id: '3', invoice: 'INV-0003', customer: 'Customer 3', date: '2026-07-30', itemsCount: 1, itemsDesc: 'Galvanized Binding Wire 1.6mm (45 kg)', totalQty: 45, uom: 'kg', status: 'paid', subtotal: 1200.00, gst: 60.00, total: 1260.00, paid: 1260.00, due: 0.00 },
  { id: '4', invoice: 'INV-0002', customer: 'Customer 2', date: '2026-07-15', itemsCount: 2, itemsDesc: 'High Tensile Wire (30 kg), Barbed Wire 2.0mm (25 m)', totalQty: 55, uom: 'Units', status: 'partial', subtotal: 1500.00, gst: 270.00, total: 1770.00, paid: 1000.00, due: 770.00 },
  { id: '5', invoice: 'INV-0001', customer: 'Customer 1', date: '2026-06-25', itemsCount: 4, itemsDesc: 'Steel Wire 2.5mm (50 kg), Copper Conductor (40 m), Alloy Wire (20 kg)', totalQty: 110, uom: 'Units', status: 'paid', subtotal: 3100.00, gst: 462.00, total: 3562.00, paid: 3562.00, due: 0.00 },
];

const DEFAULT_PURCHASES_DATA: PurchaseRow[] = [
  { id: '1', po: 'PO-0003', supplier: 'Supplier 2', date: '2026-08-24', itemsCount: 2, itemsDesc: 'Raw Wire Rod 5.5mm SAE 1008 (120 kg), Zinc Ingot 99.99% (50 kg)', totalQty: 170, uom: 'kg', status: 'received', subtotal: 4000.00, gst: 720.00, total: 4720.00, paid: 4720.00, due: 0.00 },
  { id: '2', po: 'PO-0002', supplier: 'Supplier 2', date: '2026-08-04', itemsCount: 1, itemsDesc: 'Copper Cathode Grade A (80 kg)', totalQty: 80, uom: 'kg', status: 'pending', subtotal: 4000.00, gst: 720.00, total: 4720.00, paid: 0.00, due: 4720.00 },
  { id: '3', po: 'PO-0001', supplier: 'Supplier 1', date: '2026-05-26', itemsCount: 3, itemsDesc: 'High Carbon Steel Billet (200 kg), Lubricant Powder (50 kg)', totalQty: 250, uom: 'kg', status: 'received', subtotal: 10000.00, gst: 1500.00, total: 11500.00, paid: 11500.00, due: 0.00 },
];

const DEFAULT_PRODUCT_SALES_DATA: ProductSalesRow[] = [
  { id: '1', productCode: 'PWI-W-01', productName: 'High Tensile Steel Wire 2.5mm', category: 'Finished Goods', qtySold: 120, unitPrice: 150.00, subtotal: 18000.00, gst: 3240.00, total: 21240.00 },
  { id: '2', productCode: 'PWI-W-02', productName: 'Galvanized Binding Wire 1.6mm', category: 'Finished Goods', qtySold: 60, unitPrice: 220.00, subtotal: 13200.00, gst: 2376.00, total: 15576.00 },
  { id: '3', productCode: 'PWI-C-01', productName: 'Pure Copper Conductor 4mm', category: 'Conductor', qtySold: 40, unitPrice: 180.00, subtotal: 7200.00, gst: 1296.00, total: 8496.00 },
  { id: '4', productCode: 'PWI-A-01', productName: 'Aluminum Alloy Wire Rod 6mm', category: 'Alloy', qtySold: 20, unitPrice: 113.90, subtotal: 2278.00, gst: 410.00, total: 2688.00 },
];

const DEFAULT_CUSTOMER_SALES_DATA: CustomerSalesRow[] = [
  { id: '1', customerCode: 'CUS-001', customerName: 'Customer 1', invoicesCount: 3, itemsCount: 9, totalQty: 195, subtotal: 5350.00, gst: 856.20, total: 6946.00, paid: 5294.00, due: 1652.00 },
  { id: '2', customerCode: 'CUS-002', customerName: 'Customer 2', invoicesCount: 1, itemsCount: 2, totalQty: 55, subtotal: 1500.00, gst: 270.00, total: 1770.00, paid: 1000.00, due: 770.00 },
  { id: '3', customerCode: 'CUS-003', customerName: 'Customer 3', invoicesCount: 1, itemsCount: 1, totalQty: 45, subtotal: 1200.00, gst: 60.00, total: 1260.00, paid: 1260.00, due: 0.00 },
];

const DEFAULT_PRODUCT_MARGIN_DATA: ProductMarginRow[] = [
  { id: '1', productCode: 'PWI-W-01', productName: 'High Tensile Steel Wire 2.5mm', sellingPrice: 177.00, costPrice: 132.75, marginAmount: 44.25, marginPercent: 25.0 },
  { id: '2', productCode: 'PWI-W-02', productName: 'Galvanized Binding Wire 1.6mm', sellingPrice: 259.60, costPrice: 181.72, marginAmount: 77.88, marginPercent: 30.0 },
  { id: '3', productCode: 'PWI-C-01', productName: 'Pure Copper Conductor 4mm', sellingPrice: 212.40, costPrice: 169.92, marginAmount: 42.48, marginPercent: 20.0 },
  { id: '4', productCode: 'PWI-A-01', productName: 'Aluminum Alloy Wire Rod 6mm', sellingPrice: 134.40, costPrice: 87.36, marginAmount: 47.04, marginPercent: 35.0 },
];

const DEFAULT_CUSTOMER_MARGIN_DATA: CustomerMarginRow[] = [
  { id: '1', customerCode: 'CUS-001', customerName: 'Customer 1', revenue: 6946.00, cost: 4862.20, grossProfit: 2083.80, marginPercent: 30.0 },
  { id: '2', customerCode: 'CUS-002', customerName: 'Customer 2', revenue: 1770.00, cost: 1327.50, grossProfit: 442.50, marginPercent: 25.0 },
  { id: '3', customerCode: 'CUS-003', customerName: 'Customer 3', revenue: 1260.00, cost: 1010.30, grossProfit: 249.70, marginPercent: 19.8 },
];

export const GeneralReports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<ReportType | undefined>('sales');
  const [fromDate, setFromDate] = useState<Dayjs | null>(null);
  const [toDate, setToDate] = useState<Dayjs | null>(null);
  const [isGenerated, setIsGenerated] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [printModalVisible, setPrintModalVisible] = useState<boolean>(false);

  // Handle report generation
  const handleGenerate = () => {
    if (!selectedReport) {
      message.warning('Please select a report type first');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setIsGenerated(true);
      setLoading(false);
      message.success('Report generated successfully');
    }, 300);
  };

  // Handle clear options
  const handleClear = () => {
    setSelectedReport(undefined);
    setFromDate(null);
    setToDate(null);
    setIsGenerated(false);
    message.info('Report options cleared');
  };

  // Filter datasets date-wise
  const filteredSales = useMemo(() => {
    return DEFAULT_SALES_DATA.filter((row) => {
      const d = dayjs(row.date);
      if (fromDate && d.isBefore(fromDate, 'day')) return false;
      if (toDate && d.isAfter(toDate, 'day')) return false;
      return true;
    });
  }, [fromDate, toDate]);

  const filteredPurchases = useMemo(() => {
    return DEFAULT_PURCHASES_DATA.filter((row) => {
      const d = dayjs(row.date);
      if (fromDate && d.isBefore(fromDate, 'day')) return false;
      if (toDate && d.isAfter(toDate, 'day')) return false;
      return true;
    });
  }, [fromDate, toDate]);

  // Financial KPI totals for Sales
  const salesSummary = useMemo(() => {
    const invoices = filteredSales.length;
    const totalItems = filteredSales.reduce((acc, r) => acc + r.itemsCount, 0);
    const totalQty = filteredSales.reduce((acc, r) => acc + r.totalQty, 0);
    const subtotal = filteredSales.reduce((acc, r) => acc + r.subtotal, 0);
    const gst = filteredSales.reduce((acc, r) => acc + r.gst, 0);
    const total = filteredSales.reduce((acc, r) => acc + r.total, 0);
    const paid = filteredSales.reduce((acc, r) => acc + r.paid, 0);
    const outstanding = filteredSales.reduce((acc, r) => acc + r.due, 0);
    return { invoices, totalItems, totalQty, subtotal, gst, total, paid, outstanding };
  }, [filteredSales]);

  // Financial KPI totals for Purchases
  const purchasesSummary = useMemo(() => {
    const orders = filteredPurchases.length;
    const totalItems = filteredPurchases.reduce((acc, r) => acc + r.itemsCount, 0);
    const totalQty = filteredPurchases.reduce((acc, r) => acc + r.totalQty, 0);
    const subtotal = filteredPurchases.reduce((acc, r) => acc + r.subtotal, 0);
    const gst = filteredPurchases.reduce((acc, r) => acc + r.gst, 0);
    const total = filteredPurchases.reduce((acc, r) => acc + r.total, 0);
    const paid = filteredPurchases.reduce((acc, r) => acc + r.paid, 0);
    const outstanding = filteredPurchases.reduce((acc, r) => acc + r.due, 0);
    return { orders, totalItems, totalQty, subtotal, gst, total, paid, outstanding };
  }, [filteredPurchases]);

  // CSV Export handler
  const handleExportCsv = useCallback(() => {
    if (!isGenerated || !selectedReport) {
      message.warning('Please generate a report before exporting');
      return;
    }

    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let filename = `report_${selectedReport}_${dayjs().format('YYYYMMDD_HHmm')}.csv`;

    if (selectedReport === 'sales') {
      headers = ['Invoice', 'Customer', 'Date', 'Items Count', 'Items Description', 'Total Qty', 'Status', 'Subtotal', 'GST', 'Total', 'Paid', 'Due'];
      rows = filteredSales.map(r => [
        r.invoice, r.customer, dayjs(r.date).format('DD MMM YYYY'), r.itemsCount, `"${r.itemsDesc}"`, `${r.totalQty} ${r.uom}`, r.status,
        r.subtotal, r.gst, r.total, r.paid, r.due
      ]);
    } else if (selectedReport === 'purchases') {
      headers = ['PO', 'Supplier', 'Date', 'Items Count', 'Items Description', 'Total Qty', 'Status', 'Subtotal', 'GST', 'Total', 'Paid', 'Due'];
      rows = filteredPurchases.map(r => [
        r.po, r.supplier, dayjs(r.date).format('DD MMM YYYY'), r.itemsCount, `"${r.itemsDesc}"`, `${r.totalQty} ${r.uom}`, r.status,
        r.subtotal, r.gst, r.total, r.paid, r.due
      ]);
    } else if (selectedReport === 'product_sales') {
      headers = ['Product Code', 'Product Name', 'Category', 'Qty Sold', 'Unit Price', 'Subtotal', 'GST', 'Total'];
      rows = DEFAULT_PRODUCT_SALES_DATA.map(r => [
        r.productCode, `"${r.productName}"`, r.category, r.qtySold, r.unitPrice, r.subtotal, r.gst, r.total
      ]);
    } else if (selectedReport === 'customer_sales') {
      headers = ['Customer Code', 'Customer Name', 'Invoices', 'Items Count', 'Total Qty', 'Subtotal', 'GST', 'Total', 'Paid', 'Due'];
      rows = DEFAULT_CUSTOMER_SALES_DATA.map(r => [
        r.customerCode, `"${r.customerName}"`, r.invoicesCount, r.itemsCount, r.totalQty, r.subtotal, r.gst, r.total, r.paid, r.due
      ]);
    } else if (selectedReport === 'product_margin') {
      headers = ['Product Code', 'Product Name', 'Selling Price', 'Cost Price', 'Margin (Rs)', 'Margin (%)'];
      rows = DEFAULT_PRODUCT_MARGIN_DATA.map(r => [
        r.productCode, `"${r.productName}"`, r.sellingPrice, r.costPrice, r.marginAmount, `${r.marginPercent}%`
      ]);
    } else {
      headers = ['Customer Code', 'Customer Name', 'Revenue', 'Cost', 'Gross Profit', 'Margin (%)'];
      rows = DEFAULT_CUSTOMER_MARGIN_DATA.map(r => [
        r.customerCode, `"${r.customerName}"`, r.revenue, r.cost, r.grossProfit, `${r.marginPercent}%`
      ]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success(`Exported ${rows.length} rows to ${filename}`);
  }, [isGenerated, selectedReport, filteredSales, filteredPurchases]);

  // Native Print Handler
  const handlePrint = () => {
    setPrintModalVisible(true);
  };

  const handleExecuteBrowserPrint = () => {
    const printArea = document.getElementById('printable-report-area');
    if (!printArea) {
      window.print();
      return;
    }

    // Isolate printable document into an invisible iframe so background elements NEVER bleed into PDF
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${(selectedReport || 'REPORT').toUpperCase().replace('_', ' ')} REPORT - PWI ERP</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background: #ffffff;
              color: #0f172a;
              padding: 10px;
            }
            .report-print-container {
              background-color: #ffffff;
              color: #0f172a;
              width: 100%;
            }
            .report-print-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 14px;
            }
            .report-print-logo-box {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .report-print-logo-badge {
              background-color: #0b192c !important;
              color: #ffffff !important;
              font-weight: 900;
              font-size: 15px;
              padding: 6px 12px;
              border-radius: 4px;
              letter-spacing: 0.5px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .report-print-company-name {
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
            }
            .report-print-meta {
              font-size: 11px;
              color: #64748b;
              margin-top: 2px;
            }
            .report-print-badge-box {
              text-align: right;
            }
            .report-print-type-badge {
              background-color: #1e3a8a !important;
              color: #ffffff !important;
              font-size: 12px;
              font-weight: 800;
              padding: 5px 12px;
              border-radius: 4px;
              display: inline-block;
              letter-spacing: 0.5px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .report-print-summary-box {
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 10px 14px;
              margin-bottom: 14px;
              background-color: #f8fafc !important;
              font-size: 11.5px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .report-print-summary-title {
              font-size: 10.5px;
              font-weight: 800;
              color: #475569;
              text-transform: uppercase;
              margin-bottom: 6px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 3px;
            }
            .report-print-summary-grid {
              display: grid;
              grid-template-columns: repeat(8, 1fr);
              gap: 8px;
              font-size: 11px;
            }
            .report-print-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
              margin-top: 6px;
            }
            .report-print-table th {
              background-color: #181f2c !important;
              color: #ffffff !important;
              text-align: left;
              padding: 7px 8px;
              font-weight: 700;
              border: 1px solid #181f2c;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .report-print-table td {
              padding: 6px 8px;
              border: 1px solid #cbd5e1;
              color: #0f172a;
            }
            .report-print-table tr.total-row td {
              font-weight: 800;
              background-color: #f1f5f9 !important;
              border-top: 2px solid #0f172a;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          </style>
        </head>
        <body>
          <div class="report-print-container">
            ${printArea.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 250);
  };

  // Sync action buttons into Main Application Header
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'print-report',
        node: (
          <Button
            className="reports-btn-print"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            Print
          </Button>
        ),
      },
      {
        key: 'csv-report',
        node: (
          <Button
            className="reports-btn-csv"
            icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
            onClick={handleExportCsv}
          >
            CSV
          </Button>
        ),
      },
    ]);

    return () => {
      clearHeaderActions();
    };
  }, [handleExportCsv]);

  // Report title label
  const reportLabel = useMemo(() => {
    switch (selectedReport) {
      case 'sales': return 'Sales Report';
      case 'purchases': return 'Purchases Report';
      case 'product_sales': return 'Product Sales Report';
      case 'customer_sales': return 'Customer Sales Report';
      case 'product_margin': return 'Product Margin Report';
      case 'customer_margin': return 'Customer Margin Report';
      default: return 'Report';
    }
  }, [selectedReport]);

  return (
    <div className="reports-page-container">
      <div className="reports-main-card">
        {/* Page Title & Breadcrumb header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="reports-header-title" style={{ margin: 0 }}>
            <PieChartOutlined className="reports-header-icon" />
            <span>Reports</span>
          </div>

          <div className="reports-header-actions">
            <Button
              className="reports-btn-print"
              icon={<PrinterOutlined />}
              onClick={handlePrint}
            >
              Print
            </Button>
            <Button
              className="reports-btn-csv"
              icon={<FileExcelOutlined style={{ color: '#16a34a' }} />}
              onClick={handleExportCsv}
            >
              CSV
            </Button>
          </div>
        </div>

        {/* Report Options Box (Pixel-Perfect from Screenshot 1 & 2) */}
        <div className="reports-options-box">
          <div className="reports-options-top">
            <div className="reports-options-title">
              <FilterOutlined /> Report Options
            </div>
            <button className="reports-btn-clear" onClick={handleClear}>
              <CloseCircleOutlined /> Clear
            </button>
          </div>

          <div className="reports-filter-grid">
            <div className="reports-field-group">
              <label className="reports-field-label">
                <FileExcelOutlined style={{ color: '#10b981' }} /> REPORT
              </label>
              <Select
                value={selectedReport}
                onChange={(val) => {
                  setSelectedReport(val);
                  setIsGenerated(false);
                }}
                placeholder="Choose a report..."
                style={{ width: '100%' }}
                size="large"
              >
                <Select.Option value="sales">Sales</Select.Option>
                <Select.Option value="purchases">Purchases</Select.Option>
                <Select.Option value="product_sales">Product Sales</Select.Option>
                <Select.Option value="customer_sales">Customer Sales</Select.Option>
                <Select.Option value="product_margin">Product Margin</Select.Option>
                <Select.Option value="customer_margin">Customer Margin</Select.Option>
              </Select>
            </div>

            <div className="reports-field-group">
              <label className="reports-field-label">
                <CalendarOutlined style={{ color: '#10b981' }} /> FROM
              </label>
              <DatePicker
                value={fromDate}
                onChange={(d) => setFromDate(d)}
                placeholder="mm/dd/yyyy"
                style={{ width: '100%' }}
                size="large"
                format="MM/DD/YYYY"
              />
            </div>

            <div className="reports-field-group">
              <label className="reports-field-label">
                <CalendarOutlined style={{ color: '#10b981' }} /> TO
              </label>
              <DatePicker
                value={toDate}
                onChange={(d) => setToDate(d)}
                placeholder="mm/dd/yyyy"
                style={{ width: '100%' }}
                size="large"
                format="MM/DD/YYYY"
              />
            </div>

            <div>
              <Button
                type="primary"
                className="reports-btn-generate"
                icon={<CaretRightOutlined />}
                loading={loading}
                onClick={handleGenerate}
              >
                Generate
              </Button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="reports-info-banner">
            <InfoCircleOutlined style={{ fontSize: 16 }} />
            <span>
              Cancelled invoices, quotations and proformas are excluded from every report, so these figures always agree with the dashboard for the same dates.
            </span>
          </div>
        </div>

        {/* Generated Report Content */}
        {isGenerated && (
          <div>
            {/* KPI Summary Cards Grid */}
            {selectedReport === 'sales' && (
              <div className="reports-kpi-grid">
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">INVOICES</div>
                  <div className="reports-kpi-value">{salesSummary.invoices}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL ITEMS</div>
                  <div className="reports-kpi-value">{salesSummary.totalItems} Items</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL QTY</div>
                  <div className="reports-kpi-value">{salesSummary.totalQty} Units</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">SUBTOTAL</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(salesSummary.subtotal)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">GST</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(salesSummary.gst)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(salesSummary.total)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">PAID</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(salesSummary.paid)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">OUTSTANDING</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(salesSummary.outstanding)}</div>
                </div>
              </div>
            )}

            {selectedReport === 'purchases' && (
              <div className="reports-kpi-grid">
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">PURCHASE ORDERS</div>
                  <div className="reports-kpi-value">{purchasesSummary.orders}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL ITEMS</div>
                  <div className="reports-kpi-value">{purchasesSummary.totalItems} Items</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL QTY</div>
                  <div className="reports-kpi-value">{purchasesSummary.totalQty} kg</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">SUBTOTAL</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(purchasesSummary.subtotal)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">GST</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(purchasesSummary.gst)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(purchasesSummary.total)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">PAID</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(purchasesSummary.paid)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">OUTSTANDING</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(purchasesSummary.outstanding)}</div>
                </div>
              </div>
            )}

            {selectedReport === 'product_sales' && (
              <div className="reports-kpi-grid">
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">PRODUCTS SOLD</div>
                  <div className="reports-kpi-value">4 Items</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL UNITS</div>
                  <div className="reports-kpi-value">240 Units</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">SUBTOTAL</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(40678.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">GST</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(7322.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL REVENUE</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(48000.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">AVG UNIT PRICE</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(200.00)}</div>
                </div>
              </div>
            )}

            {selectedReport === 'customer_sales' && (
              <div className="reports-kpi-grid">
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">CUSTOMERS</div>
                  <div className="reports-kpi-value">3</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">INVOICES</div>
                  <div className="reports-kpi-value">5</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL ITEMS</div>
                  <div className="reports-kpi-value">12 Items</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL QTY</div>
                  <div className="reports-kpi-value">295 Units</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL BILLED</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(9976.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">PAID</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(7554.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">BALANCE DUE</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(2422.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">RECOVERY RATE</div>
                  <div className="reports-kpi-value">75.7%</div>
                </div>
              </div>
            )}

            {selectedReport === 'product_margin' && (
              <div className="reports-kpi-grid">
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">PRODUCTS</div>
                  <div className="reports-kpi-value">4 Items</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL REVENUE</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(48000.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">EST. COST</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(36000.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">GROSS MARGIN</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(12000.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">AVG MARGIN</div>
                  <div className="reports-kpi-value">25.0%</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">MAX MARGIN</div>
                  <div className="reports-kpi-value">35.0%</div>
                </div>
              </div>
            )}

            {selectedReport === 'customer_margin' && (
              <div className="reports-kpi-grid">
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">CUSTOMERS</div>
                  <div className="reports-kpi-value">3</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOTAL REVENUE</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(9976.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">EST. COST</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(7200.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">GROSS PROFIT</div>
                  <div className="reports-kpi-value">Rs {formatDecimal(2776.00)}</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">OVERALL MARGIN</div>
                  <div className="reports-kpi-value">27.8%</div>
                </div>
                <div className="reports-kpi-card">
                  <div className="reports-kpi-title">TOP CUSTOMER</div>
                  <div className="reports-kpi-value">Customer 1</div>
                </div>
              </div>
            )}

            {/* Dynamic Tables Based on Selected Report */}
            {selectedReport === 'sales' && (
              <Table
                className="reports-table"
                rowKey="id"
                pagination={false}
                dataSource={filteredSales}
                columns={[
                  {
                    title: 'Invoice',
                    dataIndex: 'invoice',
                    key: 'invoice',
                    render: (t) => <span style={{ fontWeight: 700 }}>{t}</span>,
                  },
                  {
                    title: 'Customer',
                    dataIndex: 'customer',
                    key: 'customer',
                  },
                  {
                    title: 'Date',
                    dataIndex: 'date',
                    key: 'date',
                    render: (d) => dayjs(d).format('DD MMM YYYY'),
                  },
                  {
                    title: 'Items & Description',
                    dataIndex: 'itemsDesc',
                    key: 'itemsDesc',
                    render: (desc, r) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{desc}</div>
                        <Tag color="blue" style={{ marginTop: 2, fontSize: 11 }}>{r.itemsCount} Items</Tag>
                      </div>
                    ),
                  },
                  {
                    title: 'Qty',
                    dataIndex: 'totalQty',
                    key: 'totalQty',
                    align: 'right',
                    render: (qty, r) => (
                      <Tag color="cyan" style={{ fontWeight: 700, fontSize: 12 }}>
                        {qty} {r.uom}
                      </Tag>
                    ),
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    align: 'center',
                    render: (st) => {
                      const col = st === 'paid' ? 'success' : st === 'partial' ? 'warning' : 'default';
                      return <Tag color={col}>{st}</Tag>;
                    },
                  },
                  {
                    title: 'Subtotal',
                    dataIndex: 'subtotal',
                    key: 'subtotal',
                    align: 'right',
                    render: (val) => `Rs ${formatDecimal(val)}`,
                  },
                  {
                    title: 'GST',
                    dataIndex: 'gst',
                    key: 'gst',
                    align: 'right',
                    render: (val) => `Rs ${formatDecimal(val)}`,
                  },
                  {
                    title: 'Total',
                    dataIndex: 'total',
                    key: 'total',
                    align: 'right',
                    render: (val) => <span style={{ fontWeight: 700 }}>Rs {formatDecimal(val)}</span>,
                  },
                  {
                    title: 'Paid',
                    dataIndex: 'paid',
                    key: 'paid',
                    align: 'right',
                    render: (val) => `Rs ${formatDecimal(val)}`,
                  },
                  {
                    title: 'Due',
                    dataIndex: 'due',
                    key: 'due',
                    align: 'right',
                    render: (val) => (
                      <span style={{ fontWeight: val > 0 ? 700 : 400, color: val > 0 ? '#dc2626' : undefined }}>
                        Rs {formatDecimal(val)}
                      </span>
                    ),
                  },
                ]}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row className="reports-table-footer-row">
                      <Table.Summary.Cell index={0} colSpan={3}><b>TOTAL</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={1}><b>{salesSummary.totalItems} Items</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <Tag color="cyan" style={{ fontWeight: 800 }}>{salesSummary.totalQty} Units</Tag>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} />
                      <Table.Summary.Cell index={4} align="right"><b>Rs {formatDecimal(salesSummary.subtotal)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right"><b>Rs {formatDecimal(salesSummary.gst)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right"><b>Rs {formatDecimal(salesSummary.total)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={7} align="right"><b>Rs {formatDecimal(salesSummary.paid)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={8} align="right"><b style={{ color: salesSummary.outstanding > 0 ? '#dc2626' : undefined }}>Rs {formatDecimal(salesSummary.outstanding)}</b></Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            )}

            {selectedReport === 'purchases' && (
              <Table
                className="reports-table"
                rowKey="id"
                pagination={false}
                dataSource={filteredPurchases}
                columns={[
                  {
                    title: 'PO',
                    dataIndex: 'po',
                    key: 'po',
                    render: (t) => <span style={{ fontWeight: 700 }}>{t}</span>,
                  },
                  {
                    title: 'Supplier',
                    dataIndex: 'supplier',
                    key: 'supplier',
                  },
                  {
                    title: 'Date',
                    dataIndex: 'date',
                    key: 'date',
                    render: (d) => dayjs(d).format('DD MMM YYYY'),
                  },
                  {
                    title: 'Items / Raw Material',
                    dataIndex: 'itemsDesc',
                    key: 'itemsDesc',
                    render: (desc, r) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{desc}</div>
                        <Tag color="blue" style={{ marginTop: 2, fontSize: 11 }}>{r.itemsCount} Items</Tag>
                      </div>
                    ),
                  },
                  {
                    title: 'Qty',
                    dataIndex: 'totalQty',
                    key: 'totalQty',
                    align: 'right',
                    render: (qty, r) => (
                      <Tag color="cyan" style={{ fontWeight: 700, fontSize: 12 }}>
                        {qty} {r.uom}
                      </Tag>
                    ),
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    key: 'status',
                    align: 'center',
                    render: (st) => {
                      const col = st === 'received' ? 'success' : 'default';
                      return <Tag color={col}>{st}</Tag>;
                    },
                  },
                  {
                    title: 'Subtotal',
                    dataIndex: 'subtotal',
                    key: 'subtotal',
                    align: 'right',
                    render: (val) => `Rs ${formatDecimal(val)}`,
                  },
                  {
                    title: 'GST',
                    dataIndex: 'gst',
                    key: 'gst',
                    align: 'right',
                    render: (val) => `Rs ${formatDecimal(val)}`,
                  },
                  {
                    title: 'Total',
                    dataIndex: 'total',
                    key: 'total',
                    align: 'right',
                    render: (val) => <span style={{ fontWeight: 700 }}>Rs {formatDecimal(val)}</span>,
                  },
                  {
                    title: 'Paid',
                    dataIndex: 'paid',
                    key: 'paid',
                    align: 'right',
                    render: (val) => `Rs ${formatDecimal(val)}`,
                  },
                  {
                    title: 'Due',
                    dataIndex: 'due',
                    key: 'due',
                    align: 'right',
                    render: (val) => (
                      <span style={{ fontWeight: val > 0 ? 700 : 400, color: val > 0 ? '#dc2626' : undefined }}>
                        Rs {formatDecimal(val)}
                      </span>
                    ),
                  },
                ]}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row className="reports-table-footer-row">
                      <Table.Summary.Cell index={0} colSpan={3}><b>TOTAL</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={1}><b>{purchasesSummary.totalItems} Items</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <Tag color="cyan" style={{ fontWeight: 800 }}>{purchasesSummary.totalQty} kg</Tag>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} />
                      <Table.Summary.Cell index={4} align="right"><b>Rs {formatDecimal(purchasesSummary.subtotal)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right"><b>Rs {formatDecimal(purchasesSummary.gst)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right"><b>Rs {formatDecimal(purchasesSummary.total)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={7} align="right"><b>Rs {formatDecimal(purchasesSummary.paid)}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={8} align="right"><b style={{ color: purchasesSummary.outstanding > 0 ? '#dc2626' : undefined }}>Rs {formatDecimal(purchasesSummary.outstanding)}</b></Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            )}

            {selectedReport === 'product_sales' && (
              <Table
                className="reports-table"
                rowKey="id"
                pagination={false}
                dataSource={DEFAULT_PRODUCT_SALES_DATA}
                columns={[
                  { title: 'Code', dataIndex: 'productCode', key: 'productCode', render: t => <b>{t}</b> },
                  { title: 'Product Name', dataIndex: 'productName', key: 'productName' },
                  { title: 'Category', dataIndex: 'category', key: 'category' },
                  { title: 'Units Sold', dataIndex: 'qtySold', key: 'qtySold', align: 'center' },
                  { title: 'Unit Price', dataIndex: 'unitPrice', key: 'unitPrice', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'GST', dataIndex: 'gst', key: 'gst', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Total Revenue', dataIndex: 'total', key: 'total', align: 'right', render: v => <b>Rs {formatDecimal(v)}</b> },
                ]}
              />
            )}

            {selectedReport === 'customer_sales' && (
              <Table
                className="reports-table"
                rowKey="id"
                pagination={false}
                dataSource={DEFAULT_CUSTOMER_SALES_DATA}
                columns={[
                  { title: 'Customer Code', dataIndex: 'customerCode', key: 'customerCode', render: t => <b>{t}</b> },
                  { title: 'Customer Name', dataIndex: 'customerName', key: 'customerName' },
                  { title: 'Invoices', dataIndex: 'invoicesCount', key: 'invoicesCount', align: 'center' },
                  { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'GST', dataIndex: 'gst', key: 'gst', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Total Billed', dataIndex: 'total', key: 'total', align: 'right', render: v => <b>Rs {formatDecimal(v)}</b> },
                  { title: 'Paid', dataIndex: 'paid', key: 'paid', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Balance Due', dataIndex: 'due', key: 'due', align: 'right', render: v => <b style={{ color: v > 0 ? '#dc2626' : undefined }}>Rs {formatDecimal(v)}</b> },
                ]}
              />
            )}

            {selectedReport === 'product_margin' && (
              <Table
                className="reports-table"
                rowKey="id"
                pagination={false}
                dataSource={DEFAULT_PRODUCT_MARGIN_DATA}
                columns={[
                  { title: 'Product Code', dataIndex: 'productCode', key: 'productCode', render: t => <b>{t}</b> },
                  { title: 'Product Name', dataIndex: 'productName', key: 'productName' },
                  { title: 'Selling Price', dataIndex: 'sellingPrice', key: 'sellingPrice', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Cost Price', dataIndex: 'costPrice', key: 'costPrice', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Margin (Rs)', dataIndex: 'marginAmount', key: 'marginAmount', align: 'right', render: v => <b>Rs {formatDecimal(v)}</b> },
                  { title: 'Margin (%)', dataIndex: 'marginPercent', key: 'marginPercent', align: 'center', render: v => <Tag color="green">{v}%</Tag> },
                ]}
              />
            )}

            {selectedReport === 'customer_margin' && (
              <Table
                className="reports-table"
                rowKey="id"
                pagination={false}
                dataSource={DEFAULT_CUSTOMER_MARGIN_DATA}
                columns={[
                  { title: 'Customer Code', dataIndex: 'customerCode', key: 'customerCode', render: t => <b>{t}</b> },
                  { title: 'Customer Name', dataIndex: 'customerName', key: 'customerName' },
                  { title: 'Revenue', dataIndex: 'revenue', key: 'revenue', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Est. Cost', dataIndex: 'cost', key: 'cost', align: 'right', render: v => `Rs ${formatDecimal(v)}` },
                  { title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', align: 'right', render: v => <b>Rs {formatDecimal(v)}</b> },
                  { title: 'Margin (%)', dataIndex: 'marginPercent', key: 'marginPercent', align: 'center', render: v => <Tag color="green">{v}%</Tag> },
                ]}
              />
            )}
          </div>
        )}
      </div>

      {/* Print Document Modal (Pixel-Perfect from Screenshot 3) */}
      <Modal
        open={printModalVisible}
        onCancel={() => setPrintModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPrintModalVisible(false)}>
            Close
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            style={{ backgroundColor: '#181f2c', borderColor: '#181f2c' }}
            onClick={handleExecuteBrowserPrint}
          >
            Save as PDF / Print
          </Button>,
        ]}
        width={950}
        destroyOnClose
      >
        <div className="report-print-container" id="printable-report-area">
          {/* Header */}
          <div className="report-print-header">
            <div className="report-print-logo-box">
              <div className="report-print-logo-badge">PWI ERP</div>
              <div>
                <div className="report-print-company-name">Pakistan Wire Industries (Pvt) Ltd</div>
                <div className="report-print-meta">
                  Generated {dayjs().format('DD MMM YYYY HH:mm')}
                </div>
              </div>
            </div>

            <div className="report-print-badge-box">
              <div className="report-print-type-badge">
                {selectedReport ? selectedReport.toUpperCase().replace('_', ' ') + ' REPORT' : 'REPORT'}
              </div>
              <div className="report-print-meta" style={{ marginTop: 4 }}>
                Period: {fromDate ? fromDate.format('DD MMM YYYY') : 'All time'} {toDate ? `to ${toDate.format('DD MMM YYYY')}` : ''} | {selectedReport === 'sales' ? filteredSales.length : (selectedReport === 'purchases' ? filteredPurchases.length : 4)} rows
              </div>
            </div>
          </div>

          {/* SUMMARY Box */}
          <div className="report-print-summary-box">
            <div className="report-print-summary-title">SUMMARY</div>
            {selectedReport === 'sales' && (
              <div className="report-print-summary-grid">
                <div><b>Invoices:</b> {salesSummary.invoices}</div>
                <div><b>Items:</b> {salesSummary.totalItems}</div>
                <div><b>Total Qty:</b> {salesSummary.totalQty} Units</div>
                <div><b>Subtotal:</b> Rs {formatDecimal(salesSummary.subtotal)}</div>
                <div><b>GST:</b> Rs {formatDecimal(salesSummary.gst)}</div>
                <div><b>Total:</b> Rs {formatDecimal(salesSummary.total)}</div>
                <div><b>Paid:</b> Rs {formatDecimal(salesSummary.paid)}</div>
                <div><b>Outstanding:</b> Rs {formatDecimal(salesSummary.outstanding)}</div>
              </div>
            )}
            {selectedReport === 'purchases' && (
              <div className="report-print-summary-grid">
                <div><b>Orders:</b> {purchasesSummary.orders}</div>
                <div><b>Items:</b> {purchasesSummary.totalItems}</div>
                <div><b>Total Qty:</b> {purchasesSummary.totalQty} kg</div>
                <div><b>Subtotal:</b> Rs {formatDecimal(purchasesSummary.subtotal)}</div>
                <div><b>GST:</b> Rs {formatDecimal(purchasesSummary.gst)}</div>
                <div><b>Total:</b> Rs {formatDecimal(purchasesSummary.total)}</div>
                <div><b>Paid:</b> Rs {formatDecimal(purchasesSummary.paid)}</div>
                <div><b>Outstanding:</b> Rs {formatDecimal(purchasesSummary.outstanding)}</div>
              </div>
            )}
            {selectedReport !== 'sales' && selectedReport !== 'purchases' && (
              <div className="report-print-summary-grid">
                <div><b>Total Records:</b> 4</div>
                <div><b>Report:</b> {reportLabel}</div>
                <div><b>Status:</b> Completed</div>
              </div>
            )}
          </div>

          {/* Table */}
          {selectedReport === 'sales' && (
            <table className="report-print-table">
              <thead>
                <tr>
                  <th>INVOICE</th>
                  <th>CUSTOMER</th>
                  <th>DATE</th>
                  <th>ITEMS</th>
                  <th style={{ textAlign: 'right' }}>QTY</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                  <th style={{ textAlign: 'right' }}>GST</th>
                  <th style={{ textAlign: 'right' }}>TOTAL</th>
                  <th style={{ textAlign: 'right' }}>PAID</th>
                  <th style={{ textAlign: 'right' }}>DUE</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.invoice}</b></td>
                    <td>{r.customer}</td>
                    <td>{dayjs(r.date).format('DD MMM YYYY')}</td>
                    <td>
                      <div>{r.itemsDesc}</div>
                      <small style={{ color: '#64748b' }}>({r.itemsCount} Items)</small>
                    </td>
                    <td style={{ textAlign: 'right' }}><b>{r.totalQty} {r.uom}</b></td>
                    <td>{r.status}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.subtotal)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.gst)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.total)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.paid)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.due)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={3}><b>TOTAL</b></td>
                  <td><b>{salesSummary.totalItems} Items</b></td>
                  <td style={{ textAlign: 'right' }}><b>{salesSummary.totalQty} Units</b></td>
                  <td />
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(salesSummary.subtotal)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(salesSummary.gst)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(salesSummary.total)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(salesSummary.paid)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(salesSummary.outstanding)}</b></td>
                </tr>
              </tbody>
            </table>
          )}

          {selectedReport === 'purchases' && (
            <table className="report-print-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>SUPPLIER</th>
                  <th>DATE</th>
                  <th>ITEMS</th>
                  <th style={{ textAlign: 'right' }}>QTY</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                  <th style={{ textAlign: 'right' }}>GST</th>
                  <th style={{ textAlign: 'right' }}>TOTAL</th>
                  <th style={{ textAlign: 'right' }}>PAID</th>
                  <th style={{ textAlign: 'right' }}>DUE</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.po}</b></td>
                    <td>{r.supplier}</td>
                    <td>{dayjs(r.date).format('DD MMM YYYY')}</td>
                    <td>
                      <div>{r.itemsDesc}</div>
                      <small style={{ color: '#64748b' }}>({r.itemsCount} Items)</small>
                    </td>
                    <td style={{ textAlign: 'right' }}><b>{r.totalQty} {r.uom}</b></td>
                    <td>{r.status}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.subtotal)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.gst)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.total)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.paid)}</td>
                    <td style={{ textAlign: 'right' }}>Rs {formatDecimal(r.due)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={3}><b>TOTAL</b></td>
                  <td><b>{purchasesSummary.totalItems} Items</b></td>
                  <td style={{ textAlign: 'right' }}><b>{purchasesSummary.totalQty} kg</b></td>
                  <td />
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(purchasesSummary.subtotal)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(purchasesSummary.gst)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(purchasesSummary.total)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(purchasesSummary.paid)}</b></td>
                  <td style={{ textAlign: 'right' }}><b>Rs {formatDecimal(purchasesSummary.outstanding)}</b></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default GeneralReports;
