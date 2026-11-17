import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Button,
  Form,
  Input,
  Select,
  InputNumber,
  Table,
  Card,
  App,
  Typography,
  Space,
  Popconfirm,
  DatePicker,
  Row,
  Col,
  Tooltip,
  theme,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SendOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  ClearOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ApartmentOutlined,
  ShopOutlined,
  CalendarOutlined,
  NumberOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

const { Text } = Typography;

interface ItemOption {
  id: string;
  name: string;
  code?: string;
  item_code?: string;
  base_uom_id?: string;
  uom_id?: string;
  cost_price?: number;
  standard_cost?: number;
  divisionId?: string;
  itemType?: string;
  uomCode?: string;
}

interface WarehouseOption {
  id: string;
  name: string;
  code?: string;
  warehouse_code?: string;
  division_id?: string;
  divisionId?: string;
}

interface UomOption {
  id: string;
  name: string;
  code?: string;
}

interface OpeningStockLine {
  key: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  uomId: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  serialNumber?: string;
  notes?: string;
}

const fmt = (num?: number | null, decimals = 2) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return '0';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const OpeningStock: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { can } = usePermission();
  const canCreate = can('inventory.opening_stock.create') || can('store.view');

  const [form] = Form.useForm();
  const [lines, setLines] = useState<OpeningStockLine[]>([
    { key: 'line-init-1', itemId: '', uomId: '', quantity: 1, unitCost: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);

  const [loadingItems, setLoadingItems] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch dropdown data on mount (items are loaded per division below)
  const fetchDropdowns = useCallback(async () => {
    setLoadingDropdowns(true);
    try {
      const [divRes, warehouseRes, uomRes] = await Promise.all([
        dashboardService.getFilterDivisions().catch(() => ({ data: [] })),
        apiService.get<any>('/warehouses', { limit: 200 }).catch(() => ({ data: [] })),
        apiService.get<any>('/master-data/uom', { limit: 100 }).catch(() => ({ data: [] })),
      ]);

      setDivisions(Array.isArray(divRes?.data) ? divRes.data : []);

      const rawWarehouses = warehouseRes?.data?.warehouses || warehouseRes?.data || [];
      setWarehouses(Array.isArray(rawWarehouses) ? rawWarehouses : []);

      const rawUoms = uomRes?.data?.uoms || uomRes?.data || [];
      setUoms(Array.isArray(rawUoms) ? rawUoms : []);
    } catch (err: any) {
      console.error('Failed to load dropdown data:', err);
      message.error('Failed to load initial master data');
    } finally {
      setLoadingDropdowns(false);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  // Load ONLY the items that belong to the selected division
  useEffect(() => {
    if (!selectedDivisionId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingItems(true);
      try {
        const res = await apiService.get<any>('/master-data/items', { limit: 5000, divisionId: selectedDivisionId });
        const raw: any[] = Array.isArray(res) ? res : res?.data?.items || res?.data || [];
        const normalized: ItemOption[] = raw
          .filter((it) => it?.id && (!it.divisionId || it.divisionId === selectedDivisionId))
          .map((it) => ({
            ...it,
            code: it.itemCode || it.code || it.item_code || '',
            item_code: it.itemCode || it.item_code || it.code || '',
            base_uom_id: it.baseUomId || it.base_uom_id,
            uom_id: it.uomId || it.uom_id,
            uomCode: it.baseUom?.code || it.uomCode,
          }));
        if (!cancelled) setItems(normalized);
      } catch (err) {
        console.error('Failed to load division items:', err);
        if (!cancelled) {
          setItems([]);
          message.error('Failed to load items for the selected division');
        }
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDivisionId, message]);

  // Warehouses strictly belonging to the selected division
  const filteredWarehouses = useMemo(() => {
    if (!selectedDivisionId) return [];
    return warehouses.filter((w) => (w.divisionId || w.division_id) === selectedDivisionId);
  }, [warehouses, selectedDivisionId]);

  // Auto-select the warehouse when the division has exactly one
  useEffect(() => {
    if (!selectedDivisionId) return;
    if (filteredWarehouses.length === 1) {
      form.setFieldValue('warehouseId', filteredWarehouses[0].id);
    }
  }, [filteredWarehouses, selectedDivisionId, form]);

  // Auto-generate reference number and date on mount
  useEffect(() => {
    const todayStr = dayjs().format('YYYYMMDD');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    form.setFieldsValue({
      referenceNumber: `OPN-${todayStr}-${randomSuffix}`,
      transactionDate: dayjs(),
    });
  }, [form]);

  // 2. Line management
  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${prev.length}`,
        itemId: '',
        uomId: '',
        quantity: 1,
        unitCost: 0,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const updateLine = (key: string, field: keyof OpeningStockLine, value: any) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;

        const updated = { ...l, [field]: value };

        // If item is changed, auto-populate UOM, unitCost, itemCode, itemName
        if (field === 'itemId') {
          const found = items.find((i) => i.id === value);
          if (found) {
            updated.itemCode = found.code || found.item_code || '';
            updated.itemName = found.name || '';
            if (found.base_uom_id || found.uom_id) {
              updated.uomId = found.base_uom_id || found.uom_id || '';
            }
            if (found.cost_price !== undefined && found.cost_price !== null) {
              updated.unitCost = Number(found.cost_price) || 0;
            } else if (found.standard_cost !== undefined && found.standard_cost !== null) {
              updated.unitCost = Number(found.standard_cost) || 0;
            }
          }
        }

        return updated;
      })
    );
  };

  const clearAllLines = () => {
    setLines([]);
  };

  // 3. Totals calculation
  const totalQuantity = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    [lines]
  );
  const totalValue = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0),
    [lines]
  );

  // 4. CSV Template Download
  const downloadCsvTemplate = () => {
    const headers = ['Item Code', 'Quantity', 'Unit Cost', 'Batch Number', 'Serial Number', 'Notes'];
    const sampleRows = [
      ['RM-WIRE-001', '100', '150.00', 'BATCH-01', '', 'Opening raw material stock'],
      ['PKG-001', '50', '45.00', '', '', 'Packaging boxes opening stock'],
    ];

    const csvContent = [headers.join(','), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'opening_stock_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Opening stock CSV template downloaded');
  };

  // 5. Export Current Lines to CSV
  const exportToCsv = () => {
    if (lines.length === 0) {
      message.warning('No lines to export. Add lines first.');
      return;
    }

    const headers = ['Item Code', 'Item Name', 'UOM', 'Quantity', 'Unit Cost', 'Total Cost', 'Batch Number', 'Serial Number', 'Notes'];
    const csvRows = lines.map((l) => {
      const itm = items.find((i) => i.id === l.itemId);
      const uom = uoms.find((u) => u.id === l.uomId);
      const itemCode = itm?.code || itm?.item_code || l.itemCode || '';
      const itemName = itm?.name || l.itemName || '';
      const uomCode = uom?.code || uom?.name || '';
      const totalCost = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);

      return [
        `"${itemCode}"`,
        `"${itemName.replace(/"/g, '""')}"`,
        `"${uomCode}"`,
        `"${l.quantity}"`,
        `"${l.unitCost}"`,
        `"${totalCost.toFixed(2)}"`,
        `"${l.batchNumber || ''}"`,
        `"${l.serialNumber || ''}"`,
        `"${(l.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `opening_stock_${dayjs().format('YYYYMMDD_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success(`Exported ${lines.length} lines to CSV`);
  };

  // 6. Import from CSV
  const handleImportCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;

        const rawRows = text
          .split(/\r?\n/)
          .map((r) => r.trim())
          .filter((r) => r.length > 0);

        if (rawRows.length < 2) {
          message.error('CSV file is empty or missing headers');
          return;
        }

        // Header parsing
        const headers = rawRows[0]
          .split(',')
          .map((h) => h.replace(/["']/g, '').trim().toLowerCase());

        const codeIdx = headers.findIndex((h) => h.includes('item') || h.includes('code') || h === 'sku');
        const qtyIdx = headers.findIndex((h) => h.includes('qty') || h.includes('quantity'));
        const costIdx = headers.findIndex((h) => h.includes('cost') || h.includes('price') || h.includes('rate'));
        const batchIdx = headers.findIndex((h) => h.includes('batch'));
        const serialIdx = headers.findIndex((h) => h.includes('serial'));
        const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('remark'));

        if (codeIdx === -1 || qtyIdx === -1) {
          message.error('CSV must contain "Item Code" and "Quantity" columns');
          return;
        }

        const newLines: OpeningStockLine[] = [];
        let notFoundCount = 0;

        for (let i = 1; i < rawRows.length; i++) {
          const cols = rawRows[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
          const codeVal = cols[codeIdx]?.trim();
          if (!codeVal) continue;

          // Match item
          const matchedItem = items.find(
            (item) =>
              (item.code || item.item_code || '').toLowerCase() === codeVal.toLowerCase() ||
              (item.name || '').toLowerCase() === codeVal.toLowerCase()
          );

          if (!matchedItem) {
            notFoundCount++;
            continue;
          }

          const qty = Number(cols[qtyIdx]) || 1;
          const cost =
            costIdx !== -1 && cols[costIdx] !== undefined && cols[costIdx] !== ''
              ? Number(cols[costIdx]) || 0
              : Number(matchedItem.cost_price || matchedItem.standard_cost) || 0;

          const batch = batchIdx !== -1 ? cols[batchIdx] : '';
          const serial = serialIdx !== -1 ? cols[serialIdx] : '';
          const notes = notesIdx !== -1 ? cols[notesIdx] : '';

          newLines.push({
            key: `imported-${Date.now()}-${i}`,
            itemId: matchedItem.id,
            itemCode: matchedItem.code || matchedItem.item_code || '',
            itemName: matchedItem.name,
            uomId: matchedItem.base_uom_id || matchedItem.uom_id || uoms[0]?.id || '',
            quantity: qty,
            unitCost: cost,
            batchNumber: batch,
            serialNumber: serial,
            notes,
          });
        }

        if (newLines.length === 0) {
          message.warning('No valid items found in CSV matching ERP item codes');
          return;
        }

        setLines((prev) => [...prev, ...newLines]);
        message.success(
          `Successfully imported ${newLines.length} lines from CSV!${notFoundCount > 0 ? ` (${notFoundCount} items not found)` : ''
          }`
        );
      } catch (err: any) {
        message.error('Failed to parse CSV file: ' + err.message);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 6b. Export to Excel (.xls SpreadsheetML)
  const handleExportExcel = () => {
    if (lines.length === 0) {
      message.warning('Add lines first before exporting to Excel');
      return;
    }
    const values = form.getFieldsValue();
    const warehouseObj = warehouses.find((w) => w.id === values.warehouseId);
    const divisionObj = divisions.find((d) => d.id === selectedDivisionId);
    const refNum = values.referenceNumber || 'N/A';
    const dateStr = values.transactionDate ? dayjs(values.transactionDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const warehouseName = warehouseObj?.name || 'N/A';
    const divisionName = divisionObj?.name || 'All Divisions';

    const esc = (s: unknown) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const rowsXml = lines
      .map((l, idx) => {
        const itm = items.find((i) => i.id === l.itemId);
        const uom = uoms.find((u) => u.id === l.uomId);
        const itemCode = itm?.code || itm?.item_code || l.itemCode || '';
        const itemName = itm?.name || l.itemName || '';
        const uomName = uom?.code || uom?.name || '';
        const qty = Number(l.quantity) || 0;
        const unitCost = Number(l.unitCost) || 0;
        const lineCost = qty * unitCost;
        return `<Row>
          <Cell ss:StyleID="cellC"><Data ss:Type="Number">${idx + 1}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(itemCode)}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(itemName)}</Data></Cell>
          <Cell ss:StyleID="cellC"><Data ss:Type="String">${esc(uomName)}</Data></Cell>
          <Cell ss:StyleID="num"><Data ss:Type="Number">${qty}</Data></Cell>
          <Cell ss:StyleID="num"><Data ss:Type="Number">${unitCost}</Data></Cell>
          <Cell ss:StyleID="numB"><Data ss:Type="Number">${lineCost}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(l.batchNumber || '')}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(l.serialNumber || '')}</Data></Cell>
          <Cell ss:StyleID="cell"><Data ss:Type="String">${esc(l.notes || '')}</Data></Cell>
        </Row>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#1E293B"/></Style>
  <Style ss:ID="meta"><Font ss:Bold="1" ss:Size="10" ss:Color="#475569"/></Style>
  <Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="cell"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="cellC"><Alignment ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="num"><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="numB"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="tot"><Font ss:Bold="1"/><Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="Opening Stock">
  <Table>
   <Column ss:Width="35"/><Column ss:Width="110"/><Column ss:Width="240"/><Column ss:Width="60"/><Column ss:Width="85"/><Column ss:Width="105"/><Column ss:Width="110"/><Column ss:Width="90"/><Column ss:Width="90"/><Column ss:Width="140"/>
   <Row><Cell ss:StyleID="title"><Data ss:Type="String">Pakistan Wire Industries (Pvt.) LTD — Store Opening Stock</Data></Cell></Row>
   <Row><Cell ss:StyleID="meta"><Data ss:Type="String">Reference #: ${esc(refNum)} | Date: ${esc(dateStr)} | Division: ${esc(divisionName)} | Warehouse: ${esc(warehouseName)}</Data></Cell></Row>
   <Row/>
   <Row>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">#</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Item Code</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Item Description</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">UOM</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Quantity</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Unit Cost (PKR)</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Total Cost (PKR)</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Batch #</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Serial #</Data></Cell>
    <Cell ss:StyleID="hdr"><Data ss:Type="String">Notes</Data></Cell>
   </Row>
   ${rowsXml}
   <Row>
    <Cell ss:StyleID="tot"/><Cell ss:StyleID="tot"><Data ss:Type="String">TOTAL</Data></Cell>
    <Cell ss:StyleID="tot"><Data ss:Type="String">${lines.length} Items</Data></Cell>
    <Cell ss:StyleID="tot"/>
    <Cell ss:StyleID="tot"><Data ss:Type="Number">${totalQuantity}</Data></Cell>
    <Cell ss:StyleID="tot"/>
    <Cell ss:StyleID="tot"><Data ss:Type="Number">${totalValue}</Data></Cell>
    <Cell ss:StyleID="tot"/><Cell ss:StyleID="tot"/><Cell ss:StyleID="tot"/>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Store_Opening_Stock_${refNum}_${dateStr}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Excel workbook exported successfully');
  };

  // 7. Print / Export to PDF
  const handlePrintPdf = () => {
    if (lines.length === 0) {
      message.warning('Add lines first before generating PDF');
      return;
    }

    const values = form.getFieldsValue();
    const warehouseObj = warehouses.find((w) => w.id === values.warehouseId);
    const divisionObj = divisions.find((d) => d.id === selectedDivisionId);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    // Header
    doc.setFontSize(18);
    doc.setTextColor(20, 35, 60);
    doc.text('Pakistan Wire Industries (Pvt.) LTD', 40, 42);

    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('STORE OPENING STOCK NOTE', 40, 60);

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const refNum = values.referenceNumber || 'N/A';
    const dateStr = values.transactionDate ? dayjs(values.transactionDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const warehouseName = warehouseObj?.name || 'N/A';
    const divisionName = divisionObj?.name || 'All Divisions';

    doc.text(`Reference #: ${refNum}`, 40, 80);
    doc.text(`Posting Date: ${dateStr}`, 220, 80);
    doc.text(`Division: ${divisionName}`, 400, 80);
    doc.text(`Target Warehouse: ${warehouseName}`, 580, 80);

    const tableHeaders = [
      ['#', 'Item Code', 'Item Description', 'UOM', 'Quantity', 'Unit Cost (PKR)', 'Total Cost (PKR)', 'Batch #', 'Serial #']
    ];

    const tableData = lines.map((l, idx) => {
      const itm = items.find((i) => i.id === l.itemId);
      const uom = uoms.find((u) => u.id === l.uomId);
      const itemCode = itm?.code || itm?.item_code || l.itemCode || '—';
      const itemName = itm?.name || l.itemName || '—';
      const uomName = uom?.code || uom?.name || '—';
      const lineCost = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);

      return [
        String(idx + 1),
        itemCode,
        itemName,
        uomName,
        fmt(l.quantity, 2),
        fmt(l.unitCost, 2),
        fmt(lineCost, 2),
        l.batchNumber || '—',
        l.serialNumber || '—',
      ];
    });

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 96,
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [24, 144, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' },
        1: { cellWidth: 95 },
        2: { cellWidth: 220 },
        3: { cellWidth: 50, halign: 'center' },
        4: { cellWidth: 65, halign: 'right' },
        5: { cellWidth: 75, halign: 'right' },
        6: { cellWidth: 80, halign: 'right' },
        7: { cellWidth: 70 },
        8: { cellWidth: 70 },
      },
    });

    // Summary Box & Signatures
    const finalY = (doc as any).lastAutoTable.finalY + 20;

    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text(`Total Line Items: ${lines.length}`, 40, finalY);
    doc.text(`Total Quantity: ${fmt(totalQuantity, 2)}`, 220, finalY);
    doc.text(`Total Inventory Value: PKR ${fmt(totalValue, 2)}`, 400, finalY);

    // Signatures
    const sigY = finalY + 45;
    doc.setDrawColor(180);
    doc.line(40, sigY, 180, sigY);
    doc.line(320, sigY, 460, sigY);
    doc.line(600, sigY, 740, sigY);

    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Prepared By (Store Officer)', 40, sigY + 14);
    doc.text('Verified By (Inventory Incharge)', 320, sigY + 14);
    doc.text('Authorized By (Plant GM / Director)', 600, sigY + 14);

    doc.save(`Store_Opening_Stock_${refNum}_${dateStr}.pdf`);
    message.success('PDF document generated successfully');
  };

  // 8. Submit to Backend
  const handleSubmit = async () => {
    if (lines.length === 0) {
      message.warning('Add at least one opening stock line');
      return;
    }

    // Validate that every line has itemId, uomId, and quantity > 0
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.itemId) {
        message.error(`Line #${i + 1}: Please select an Item`);
        return;
      }
      if (!l.uomId) {
        message.error(`Line #${i + 1}: Please select a UOM`);
        return;
      }
      if (!l.quantity || Number(l.quantity) <= 0) {
        message.error(`Line #${i + 1}: Quantity must be greater than 0`);
        return;
      }
    }

    const values = await form.validateFields().catch(() => null);
    if (!values) return;

    setSubmitting(true);
    try {
      const payload = {
        warehouseId: values.warehouseId,
        referenceNumber: values.referenceNumber,
        transactionDate: values.transactionDate ? values.transactionDate.toISOString() : new Date().toISOString(),
        lines: lines.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost) || 0,
          batchNumber: l.batchNumber || undefined,
          serialNumber: l.serialNumber || undefined,
          notes: l.notes || undefined,
        })),
      };

      await apiService.post('/inventory/opening-stock', payload);
      message.success(`Opening stock posted successfully (${lines.length} lines recorded in ledger & balances)`);
      setLines([]);

      const todayStr = dayjs().format('YYYYMMDD');
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      form.setFieldsValue({
        referenceNumber: `OPN-${todayStr}-${randomSuffix}`,
        transactionDate: dayjs(),
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to post opening stock';
      message.error(Array.isArray(msg) ? msg[0] : String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  // Mount Import / Export / Print actions on the Main ERP Header
  const headerActionsRef = useRef({
    downloadCsvTemplate,
    triggerImport: () => fileInputRef.current?.click(),
    exportToCsv,
    handleExportExcel,
    handlePrintPdf,
  });
  headerActionsRef.current = {
    downloadCsvTemplate,
    triggerImport: () => fileInputRef.current?.click(),
    exportToCsv,
    handleExportExcel,
    handlePrintPdf,
  };

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'os-csv-template',
        node: (
          <Tooltip title="Download CSV template format with sample rows">
            <Button size="small" icon={<DownloadOutlined />} onClick={() => headerActionsRef.current.downloadCsvTemplate()}>
              CSV Template
            </Button>
          </Tooltip>
        ),
      },
      {
        key: 'os-import-csv',
        node: (
          <Tooltip title="Import bulk items from CSV file">
            <Button size="small" icon={<UploadOutlined />} onClick={() => headerActionsRef.current.triggerImport()}>
              Import CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        key: 'os-export-csv',
        node: (
          <Tooltip title="Export current table lines to CSV">
            <Button size="small" icon={<DownloadOutlined />} disabled={lines.length === 0} onClick={() => headerActionsRef.current.exportToCsv()}>
              Export CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        key: 'os-export-excel',
        node: (
          <Tooltip title="Export styled Excel workbook (.xls)">
            <Button
              size="small"
              icon={<FileExcelOutlined />}
              disabled={lines.length === 0}
              onClick={() => headerActionsRef.current.handleExportExcel()}
              style={{ color: token.colorSuccess, borderColor: token.colorBorder, fontWeight: 600 }}
            >
              Excel
            </Button>
          </Tooltip>
        ),
      },
      {
        key: 'os-print-pdf',
        node: (
          <Tooltip title="Download / Print Store Opening Stock PDF">
            <Button
              size="small"
              icon={<FilePdfOutlined />}
              disabled={lines.length === 0}
              onClick={() => headerActionsRef.current.handlePrintPdf()}
              style={{ color: token.colorError, borderColor: token.colorBorder, fontWeight: 600 }}
            >
              PDF
            </Button>
          </Tooltip>
        ),
      },
    ]);
    return () => clearHeaderActions();
  }, [lines.length, token.colorBorder, token.colorError, token.colorSuccess, setHeaderActions, clearHeaderActions]);

  const lineColumns: ColumnsType<OpeningStockLine> = [
    {
      title: '#',
      key: 'index',
      width: 45,
      align: 'center',
      render: (_: unknown, __, idx) => <span style={{ color: '#888' }}>{idx + 1}</span>,
    },
    {
      title: 'Item',
      dataIndex: 'itemId',
      key: 'itemId',
      width: 380,
      render: (_: unknown, record) => (
        <div>
          <Select
            showSearch
            optionFilterProp="searchValue"
            popupMatchSelectWidth={false}
            dropdownStyle={{ minWidth: 640, maxWidth: 'min(880px, 94vw)' }}
            listHeight={360}
            loading={loadingItems}
            disabled={!selectedDivisionId}
            placeholder={selectedDivisionId ? 'Search by item code or name' : 'Select a division first'}
            notFoundContent={loadingItems ? 'Loading division items...' : 'No items found in this division'}
            value={record.itemId || undefined}
            onChange={(v) => updateLine(record.key, 'itemId', v)}
            style={{ width: '100%' }}
            optionLabelProp="shortLabel"
            options={items.map((i) => ({
              value: i.id,
              shortLabel: `${i.code || i.item_code || ''} — ${i.name}`.trim(),
              searchValue: `${i.code || ''} ${i.item_code || ''} ${i.name || ''}`,
              code: i.code || i.item_code || '',
              name: i.name,
              itemType: i.itemType,
              uomCode: i.uomCode,
            }))}
            optionRender={(option) => (
              <div style={{ padding: '4px 2px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ lineHeight: 1.4, whiteSpace: 'normal' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--theme-primary)', marginRight: 8 }}>
                    {option.data.code}
                  </span>
                  <span style={{ color: 'var(--theme-text)' }}>{option.data.name}</span>
                </div>
                <div style={{ whiteSpace: 'nowrap', fontSize: 11, color: 'var(--theme-text-muted)' }}>
                  {option.data.itemType ? String(option.data.itemType).replace(/_/g, ' ') : ''}
                  {option.data.uomCode ? ` · ${option.data.uomCode}` : ''}
                </div>
              </div>
            )}
          />
          {record.itemId && record.itemName && (
            <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.3, color: 'var(--theme-text-secondary)' }}>
              {record.itemCode ? `${record.itemCode} — ` : ''}
              {record.itemName}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uomId',
      key: 'uomId',
      width: 120,
      render: (_: unknown, record) => (
        <Select
          placeholder="UOM"
          value={record.uomId || undefined}
          onChange={(v) => updateLine(record.key, 'uomId', v)}
          style={{ width: '100%' }}
          options={uoms.map((u) => ({ value: u.id, label: u.code || u.name }))}
        />
      ),
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 130,
      render: (_: unknown, record) => (
        <InputNumber
          min={0.0001}
          precision={2}
          value={record.quantity}
          onChange={(v) => updateLine(record.key, 'quantity', v || 1)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Unit Cost (PKR)',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 170,
      render: (_: unknown, record) => (
        <InputNumber
          min={0}
          precision={2}
          size="middle"
          value={record.unitCost}
          onChange={(v) => updateLine(record.key, 'unitCost', v || 0)}
          style={{ width: '100%', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        />
      ),
    },
    {
      title: 'Total Cost',
      key: 'totalCost',
      width: 150,
      align: 'right',
      render: (_: unknown, record) => (
        <Text strong style={{ color: '#1677ff' }}>
          {fmt((Number(record.quantity) || 0) * (Number(record.unitCost) || 0))}
        </Text>
      ),
    },
    {
      title: 'Batch #',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      width: 140,
      render: (_: unknown, record) => (
        <Input
          placeholder="Optional"
          value={record.batchNumber}
          onChange={(e) => updateLine(record.key, 'batchNumber', e.target.value)}
        />
      ),
    },
    {
      title: 'Serial #',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      width: 140,
      render: (_: unknown, record) => (
        <Input
          placeholder="Optional"
          value={record.serialNumber}
          onChange={(e) => updateLine(record.key, 'serialNumber', e.target.value)}
        />
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 160,
      render: (_: unknown, record) => (
        <Input
          placeholder="Notes / Remarks"
          value={record.notes}
          onChange={(e) => updateLine(record.key, 'notes', e.target.value)}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 45,
      align: 'center',
      render: (_: unknown, record) => (
        <Tooltip title="Remove Line">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeLine(record.key)}
            size="small"
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 24px 32px' }}>
      {/* Hidden file input for CSV Import */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".csv"
        onChange={handleImportCsv}
      />

      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <Space align="center" size={12}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
          }}>
            <DatabaseOutlined style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-text, #1e293b)', lineHeight: 1.2 }}>
              Store Opening Stock
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--theme-text-muted, #64748b)', marginTop: 2 }}>
              Post initial stock balances and migration inventory for items into plant warehouses
            </div>
          </div>
        </Space>
      </div>

      {/* Dashboard-Style Filter / Parameters Panel */}
      <div style={{
        background: `var(--theme-surface, ${token.colorBgContainer})`,
        border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16,
      }}>
        <Form form={form} layout="vertical" style={{ margin: 0 }}>
          <Row gutter={[12, 12]} align="stretch">
            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <ApartmentOutlined style={{ marginRight: 5, color: '#eab308' }} />
                  Division
                </div>
                <Select
                  placeholder="Select division"
                  variant="borderless"
                  showSearch
                  optionFilterProp="label"
                  value={selectedDivisionId}
                  onChange={(val) => {
                    setSelectedDivisionId(val);
                    form.setFieldValue('warehouseId', undefined);
                    // Items belong to a division: reset lines so no foreign-division item remains
                    setLines([{ key: `line-${Date.now()}`, itemId: '', uomId: '', quantity: 1, unitCost: 0 }]);
                  }}
                  options={divisions.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  style={{ width: '100%', fontWeight: 600 }}
                />
              </div>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <ShopOutlined style={{ marginRight: 5, color: '#0284c7' }} />
                  Warehouse <span style={{ color: token.colorError }}>*</span>
                </div>
                <Form.Item
                  name="warehouseId"
                  rules={[{ required: true, message: 'Select a warehouse' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    variant="borderless"
                    placeholder={selectedDivisionId ? 'Select warehouse' : 'Select division first'}
                    disabled={!selectedDivisionId}
                    notFoundContent="No warehouse configured for this division"
                    popupMatchSelectWidth={false}
                    showSearch
                    optionFilterProp="label"
                    options={filteredWarehouses.map((w) => ({
                      value: w.id,
                      label: `${(w as any).warehouseCode || w.code || w.warehouse_code || ''} — ${w.name}`,
                    }))}
                    style={{ width: '100%', fontWeight: 600 }}
                  />
                </Form.Item>
              </div>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <NumberOutlined style={{ marginRight: 5, color: '#a855f7' }} />
                  Reference # <span style={{ color: token.colorError }}>*</span>
                </div>
                <Form.Item
                  name="referenceNumber"
                  rules={[{ required: true, message: 'Reference required' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Input variant="borderless" placeholder="e.g. OPN-20260920-001" style={{ fontWeight: 600, paddingLeft: 0 }} />
                </Form.Item>
              </div>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <div style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                background: token.colorFillAlter,
                height: '100%',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: token.colorTextTertiary, marginBottom: 4 }}>
                  <CalendarOutlined style={{ marginRight: 5, color: '#10b981' }} />
                  Posting Date
                </div>
                <Form.Item
                  name="transactionDate"
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker variant="borderless" style={{ width: '100%', fontWeight: 600, paddingLeft: 0 }} />
                </Form.Item>
              </div>
            </Col>
          </Row>
        </Form>
      </div>

      {/* Theme-Aware Summary KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <div style={{
            background: `var(--theme-surface, ${token.colorBgContainer})`,
            border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
            borderTop: `3px solid ${token.colorPrimary}`,
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Line Items
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: token.colorText, marginTop: 2 }}>
              <DatabaseOutlined style={{ fontSize: 16, marginRight: 8, color: token.colorPrimary }} />
              {lines.length}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{
            background: `var(--theme-surface, ${token.colorBgContainer})`,
            border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
            borderTop: '3px solid #10b981',
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Quantity
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
              {fmt(totalQuantity, 2)}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{
            background: `var(--theme-surface, ${token.colorBgContainer})`,
            border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
            borderTop: '3px solid #0284c7',
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Value (PKR)
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0284c7', marginTop: 2 }}>
              {fmt(totalValue, 2)}
            </div>
          </div>
        </Col>
      </Row>

      {/* Table Card — Clear All & Add Line stay here; Import/Export/PDF are in Main Header */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}
        styles={{ header: { borderBottom: '1px solid var(--theme-border, #e2e8f0)' } }}
        title={
          <Space size={10}>
            <FileTextOutlined style={{ color: '#2563eb' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Opening Stock Lines</span>
            <span style={{
              fontSize: 11.5, color: '#fff', fontWeight: 500,
              background: lines.length > 0 ? '#2563eb' : '#94a3b8',
              borderRadius: 10, padding: '1px 10px',
            }}>
              {lines.length} {lines.length === 1 ? 'item' : 'items'}
            </span>
          </Space>
        }
        extra={
          <Space size={8} wrap>
            {lines.length > 0 && (
              <Popconfirm
                title="Clear all lines?"
                description="This will remove all lines from this form. Already posted records are not affected."
                onConfirm={clearAllLines}
                okText="Clear"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<ClearOutlined />}>
                  Clear All
                </Button>
              </Popconfirm>
            )}

            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addLine}>
              Add Line
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={lines}
          columns={lineColumns}
          rowKey="key"
          pagination={false}
          size="middle"
          locale={{ emptyText: 'No opening stock lines added. Click "Add Line" or "Import CSV" to begin.' }}
          scroll={{ x: 1250 }}
        />

        {lines.length > 0 && (
          <div style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--theme-bg-subtle, #f8fafc)',
            borderRadius: 8,
            border: '1px solid var(--theme-border, #e2e8f0)',
          }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Items: <strong>{lines.length}</strong> &nbsp;|&nbsp; Total Qty: <strong>{fmt(totalQuantity, 2)}</strong> &nbsp;|&nbsp; Total Value: <strong>PKR {fmt(totalValue, 2)}</strong>
            </Text>
            <Popconfirm
              title="Post opening stock?"
              description="This will record initial stock ledger entries and update inventory balances immediately."
              onConfirm={handleSubmit}
              okButtonProps={{ loading: submitting }}
            >
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={submitting}
                size="large"
                style={{
                  borderRadius: 8,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                }}
              >
                Post Opening Stock
              </Button>
            </Popconfirm>
          </div>
        )}
      </Card>
    </div>
  );
};

export default OpeningStock;
