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
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SendOutlined,
  DownloadOutlined,
  UploadOutlined,
  PrinterOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import { usePermission } from '../../hooks/usePermission';

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
}

interface WarehouseOption {
  id: string;
  name: string;
  code?: string;
  warehouse_code?: string;
  division_id?: string;
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch dropdown data on mount
  const fetchDropdowns = useCallback(async () => {
    setLoadingDropdowns(true);
    try {
      const [divRes, itemRes, warehouseRes, uomRes] = await Promise.all([
        dashboardService.getFilterDivisions().catch(() => ({ data: [] })),
        apiService.get<any>('/master-data/items', { limit: 1000 }).catch(() => ({ data: [] })),
        apiService.get<any>('/warehouses', { limit: 100 }).catch(() => ({ data: [] })),
        apiService.get<any>('/master-data/uom', { limit: 100 }).catch(() => ({ data: [] })),
      ]);

      setDivisions(Array.isArray(divRes?.data) ? divRes.data : []);
      
      const rawItems = itemRes?.data?.items || itemRes?.data || [];
      setItems(Array.isArray(rawItems) ? rawItems : []);

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

  // Filter warehouses based on selected division if applicable
  const filteredWarehouses = useMemo(() => {
    if (!selectedDivisionId) return warehouses;
    const selectedDiv = divisions.find((d) => d.id === selectedDivisionId);
    const divName = (selectedDiv?.name || '').toLowerCase();
    const divCode = ((selectedDiv as any)?.code || (selectedDiv as any)?.division_code || '').toLowerCase();

    // Check if warehouse name/code matches division prefix (e.g. CCD or SPI)
    if (divName.includes('cable') || divName.includes('ccd') || divCode.includes('ccd')) {
      return warehouses.filter((w) => {
        const str = `${w.code || ''} ${w.warehouse_code || ''} ${w.name || ''}`.toLowerCase();
        return str.includes('ccd') || str.includes('main') || str.includes('lahore');
      });
    }
    if (divName.includes('spoke') || divName.includes('spi') || divCode.includes('spi')) {
      return warehouses.filter((w) => {
        const str = `${w.code || ''} ${w.warehouse_code || ''} ${w.name || ''}`.toLowerCase();
        return str.includes('spi') || str.includes('main') || str.includes('lahore');
      });
    }
    return warehouses;
  }, [warehouses, selectedDivisionId, divisions]);

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
          `Successfully imported ${newLines.length} lines from CSV!${
            notFoundCount > 0 ? ` (${notFoundCount} items not found)` : ''
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
    doc.text('PAKISTAN WIRE INDUSTRIES (PVT) LTD', 40, 42);

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
      width: 280,
      render: (_: unknown, record) => (
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Search and select item"
          value={record.itemId || undefined}
          onChange={(v) => updateLine(record.key, 'itemId', v)}
          style={{ width: '100%' }}
          options={items.map((i) => ({
            value: i.id,
            label: `${i.code || i.item_code || ''} — ${i.name}`.trim(),
          }))}
        />
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
      title: 'Unit Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 130,
      render: (_: unknown, record) => (
        <InputNumber
          min={0}
          precision={2}
          value={record.unitCost}
          onChange={(v) => updateLine(record.key, 'unitCost', v || 0)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Total Cost',
      key: 'totalCost',
      width: 130,
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

      {/* Filter / Parameters Bar */}
      <div style={{
        background: 'var(--theme-surface, #fff)',
        border: '1px solid var(--theme-border, #e2e8f0)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <Form form={form} layout="vertical" style={{ margin: 0 }}>
          <Row gutter={[16, 12]} align="bottom">
            <Col xs={24} sm={12} md={6}>
              <Form.Item label={<span style={{ fontWeight: 600, fontSize: 12.5 }}>Division</span>} style={{ marginBottom: 0 }}>
                <Select
                  placeholder="All Divisions"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={selectedDivisionId}
                  onChange={(val) => {
                    setSelectedDivisionId(val);
                    form.setFieldValue('warehouseId', undefined);
                  }}
                  options={divisions.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="warehouseId"
                label={<span style={{ fontWeight: 600, fontSize: 12.5 }}>Warehouse <span style={{ color: '#ef4444' }}>*</span></span>}
                rules={[{ required: true, message: 'Select a warehouse' }]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  placeholder="Select warehouse"
                  showSearch
                  optionFilterProp="label"
                  options={filteredWarehouses.map((w) => ({
                    value: w.id,
                    label: `${w.name} (${w.code || w.warehouse_code || ''})`,
                  }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="referenceNumber"
                label={<span style={{ fontWeight: 600, fontSize: 12.5 }}>Reference # <span style={{ color: '#ef4444' }}>*</span></span>}
                rules={[{ required: true, message: 'Reference required' }]}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="e.g. OPN-20260920-001" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="transactionDate"
                label={<span style={{ fontWeight: 600, fontSize: 12.5 }}>Posting Date</span>}
                style={{ marginBottom: 0 }}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>

      {/* Summary KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <div style={{
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            border: '1px solid #bae6fd',
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11.5, color: '#0369a1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Total Line Items
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#0c4a6e', marginTop: 2 }}>
              <DatabaseOutlined style={{ fontSize: 16, marginRight: 8, opacity: 0.5 }} />
              {lines.length}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '1px solid #bbf7d0',
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11.5, color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Total Quantity
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#14532d', marginTop: 2 }}>
              {fmt(totalQuantity, 2)}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8}>
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11.5, color: '#1d4ed8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Total Value (PKR)
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1e3a5f', marginTop: 2 }}>
              {fmt(totalValue, 2)}
            </div>
          </div>
        </Col>
      </Row>

      {/* Table Card with Import, Export, Template & Print actions */}
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
          <Space size={6} wrap>
            <Tooltip title="Download CSV template format with sample rows">
              <Button size="small" icon={<DownloadOutlined />} onClick={downloadCsvTemplate}>
                CSV Template
              </Button>
            </Tooltip>

            <Tooltip title="Import bulk items from CSV file">
              <Button
                size="small"
                icon={<UploadOutlined />}
                onClick={() => fileInputRef.current?.click()}
              >
                Import CSV
              </Button>
            </Tooltip>

            <Tooltip title="Export current table lines to CSV">
              <Button size="small" icon={<DownloadOutlined />} onClick={exportToCsv} disabled={lines.length === 0}>
                Export CSV
              </Button>
            </Tooltip>

            <Tooltip title="Print / Download PDF document">
              <Button
                size="small"
                icon={<PrinterOutlined />}
                onClick={handlePrintPdf}
                disabled={lines.length === 0}
              >
                Print / PDF
              </Button>
            </Tooltip>

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
