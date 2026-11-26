import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  Steps,
  Button,
  Space,
  Select,
  DatePicker,
  Input,
  Upload,
  Table,
  Tag,
  Alert,
  Progress,
  Descriptions,
  Segmented,
  InputNumber,
  Checkbox,
  Tooltip,
  Typography,
  Result,
  App,
  theme,
} from 'antd';
import {
  UploadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  HistoryOutlined,
  SendOutlined,
  TableOutlined,
  ArrowLeftOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import apiService from '../../services/api';
import {
  buildErrorRowsCsv,
  parseOpeningStockFile,
  revalidateAllRows,
  validateOpeningStockGrid,
  type TemplateItemRecord,
  type TemplateUomRecord,
  type ValidatedOpeningStockRow,
} from '../../utils/openingStockSpreadsheet';

const { Text } = Typography;

export interface OpeningStockImportWizardModalProps {
  open: boolean;
  onClose: () => void;
  divisions: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; code?: string; warehouseCode?: string; warehouse_code?: string; divisionId?: string; division_id?: string }>;
  allItems: TemplateItemRecord[];
  uoms: TemplateUomRecord[];
  warehouseBalances: Map<string, number>;
  initialDivisionId?: string;
  initialWarehouseId?: string;
  initialDate?: Dayjs;
  initialReference?: string;
  onOpenTemplateModal: () => void;
  onCopyToLinesGrid: (
    rows: Array<{
      itemId: string;
      itemCode: string;
      itemName: string;
      uomId: string;
      quantity: number;
      unitCost: number;
      batchNumber?: string;
      serialNumber?: string;
      notes?: string;
    }>,
    divisionId?: string,
    warehouseId?: string,
  ) => void;
  onBatchPosted: (result: {
    batchId: string;
    referenceNumber: string;
    warehouseId: string;
    posted: number;
    totalQuantity: number;
    totalValue: number;
  }) => void;
  onViewHistory: () => void;
}

export const OpeningStockImportWizardModal: React.FC<OpeningStockImportWizardModalProps> = ({
  open,
  onClose,
  divisions,
  warehouses,
  allItems,
  uoms,
  warehouseBalances,
  initialDivisionId,
  initialWarehouseId,
  initialDate,
  initialReference,
  onOpenTemplateModal,
  onCopyToLinesGrid,
  onBatchPosted,
  onViewHistory,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [divisionId, setDivisionId] = useState<string | undefined>(initialDivisionId);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(initialWarehouseId);
  const [postingDate, setPostingDate] = useState<Dayjs>(initialDate || dayjs());
  const [referenceNumber, setReferenceNumber] = useState<string>(initialReference || '');
  const [fileName, setFileName] = useState<string>('');
  const [parsing, setParsing] = useState(false);

  const [rows, setRows] = useState<ValidatedOpeningStockRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'SKIPPED' | 'ERROR'>('ALL');
  const [hideSkippedInAll, setHideSkippedInAll] = useState(false);

  // Step 3 execution & summary
  const [executing, setExecuting] = useState(false);
  const [progressCount, setProgressCount] = useState({ current: 0, total: 0, percent: 0 });
  const [postResult, setPostResult] = useState<{
    status: 'success' | 'error';
    referenceNumber: string;
    postedCount: number;
    totalQuantity: number;
    totalValue: number;
    skippedCount: number;
    failedCount: number;
    errorMessage?: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setDivisionId(initialDivisionId);
      setWarehouseId(initialWarehouseId);
      setPostingDate(initialDate || dayjs());
      setReferenceNumber(initialReference || `OPN-${dayjs().format('YYYYMMDD')}-${Math.floor(100 + Math.random() * 900)}`);
      setFileName('');
      setRows([]);
      setStatusFilter('ALL');
      setHideSkippedInAll(false);
      setExecuting(false);
      setPostResult(null);
      setProgressCount({ current: 0, total: 0, percent: 0 });
    }
  }, [open, initialDivisionId, initialWarehouseId, initialDate, initialReference]);

  const scopedWarehouses = useMemo(() => {
    if (!divisionId) return warehouses;
    return warehouses.filter((w) => (w.divisionId || w.division_id) === divisionId);
  }, [warehouses, divisionId]);

  const divisionItems = useMemo(() => {
    if (!divisionId) return allItems;
    return allItems.filter((it) => !it.divisionId || it.divisionId === divisionId);
  }, [allItems, divisionId]);

  const selectedDivisionName = useMemo(
    () => divisions.find((d) => d.id === divisionId)?.name || 'All Divisions',
    [divisions, divisionId],
  );

  const validationContext = useMemo(
    () => ({
      selectedDivisionId: divisionId,
      selectedDivisionName,
      divisionItems,
      allItems,
      divisions,
      uoms,
      balances: warehouseBalances,
    }),
    [divisionId, selectedDivisionName, divisionItems, allItems, divisions, uoms, warehouseBalances],
  );

  // Re-run validation automatically if Division changes while on Step 2
  useEffect(() => {
    if (rows.length > 0 && step === 1) {
      setRows((prev) => revalidateAllRows(prev, validationContext));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId]);

  const handleFileSelected = async (file: File) => {
    if (!warehouseId) {
      message.warning('Please select a target Warehouse before uploading.');
      return false;
    }
    setParsing(true);
    try {
      const grid = await parseOpeningStockFile(file);
      const { rows: validated, headerError } = validateOpeningStockGrid(grid, validationContext);
      if (headerError) {
        message.error(headerError);
        return false;
      }
      if (validated.length === 0) {
        message.warning('No item rows were found below the header row.');
        return false;
      }
      setFileName(file.name);
      setRows(validated);
      const errCnt = validated.filter((r) => r.status === 'ERROR').length;
      const readyCnt = validated.filter((r) => r.status === 'READY').length;
      setStatusFilter(errCnt > 0 ? 'ERROR' : readyCnt > 0 ? 'READY' : 'ALL');
      setStep(1);
    } catch (err: any) {
      message.error(`Failed to read file: ${err?.message || 'Unknown error'}`);
    } finally {
      setParsing(false);
    }
    return false;
  };

  const counts = useMemo(() => {
    let ready = 0;
    let skipped = 0;
    let error = 0;
    let totalQty = 0;
    let totalVal = 0;
    for (const r of rows) {
      if (r.status === 'READY') {
        ready += 1;
        totalQty += r.quantity;
        totalVal += r.quantity * r.unitCost;
      } else if (r.status === 'SKIPPED') {
        skipped += 1;
      } else {
        error += 1;
      }
    }
    return { total: rows.length, ready, skipped, error, totalQty, totalVal };
  }, [rows]);

  const displayedRows = useMemo(() => {
    if (statusFilter === 'ALL') {
      return hideSkippedInAll ? rows.filter((r) => r.status !== 'SKIPPED') : rows;
    }
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter, hideSkippedInAll]);

  const updateRowField = useCallback(
    (key: string, patch: Partial<ValidatedOpeningStockRow>) => {
      setRows((prev) => {
        const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
        return revalidateAllRows(next, validationContext);
      });
    },
    [validationContext],
  );

  const handleDownloadErrors = () => {
    const csv = buildErrorRowsCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opening_stock_validation_errors_${dayjs().format('YYYYMMDD_HHmm')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success(`Downloaded ${counts.error} error row(s) CSV`);
  };

  const handleCopyReadyLinesToGrid = () => {
    const readyRows = rows.filter((r) => r.status === 'READY' && r.matchedItemId && r.matchedUomId);
    if (readyRows.length === 0) {
      message.warning('No valid rows ready to copy.');
      return;
    }
    onCopyToLinesGrid(
      readyRows.map((r) => ({
        itemId: r.matchedItemId!,
        itemCode: r.itemCode,
        itemName: r.itemName,
        uomId: r.matchedUomId!,
        quantity: r.quantity,
        unitCost: r.unitCost,
        batchNumber: r.batchNumber || undefined,
        serialNumber: r.serialNumber || undefined,
        notes: r.notes || undefined,
      })),
      divisionId,
      warehouseId,
    );
    message.success(`Loaded ${readyRows.length} validated items into Opening Stock Lines`);
    onClose();
  };

  const handlePostBatchAtomically = async () => {
    const readyRows = rows.filter((r) => r.status === 'READY' && r.matchedItemId && r.matchedUomId);
    if (readyRows.length === 0) {
      message.warning('No ready items (Qty > 0) to post.');
      return;
    }
    if (!warehouseId) {
      message.error('Please select a target Warehouse.');
      return;
    }
    const cleanRef = referenceNumber.trim() || `OPN-${dayjs().format('YYYYMMDD')}-${Math.floor(100 + Math.random() * 900)}`;

    setStep(2);
    setExecuting(true);
    setPostResult(null);
    const totalItems = readyRows.length;
    setProgressCount({ current: 0, total: totalItems, percent: 10 });

    // Smooth responsive progress ticks while executing the single atomic bulk transaction
    const ticker = window.setInterval(() => {
      setProgressCount((prev) => {
        if (prev.percent >= 88) return prev;
        const nextPct = Math.min(88, prev.percent + 14);
        const nextCurrent = Math.min(totalItems, Math.max(1, Math.round((nextPct / 100) * totalItems)));
        return { current: nextCurrent, total: totalItems, percent: nextPct };
      });
    }, 120);

    try {
      const payload = {
        warehouseId,
        referenceNumber: cleanRef,
        transactionDate: postingDate ? postingDate.toISOString() : new Date().toISOString(),
        source: 'IMPORT',
        lines: readyRows.map((r) => ({
          itemId: r.matchedItemId!,
          uomId: r.matchedUomId!,
          quantity: r.quantity,
          unitCost: r.unitCost || 0,
          batchNumber: r.batchNumber || undefined,
          serialNumber: r.serialNumber || undefined,
          notes: r.notes || undefined,
        })),
      };

      const res = await apiService.post<any>('/inventory/opening-stock/bulk', payload);
      const data = res?.data || res;

      window.clearInterval(ticker);
      setProgressCount({ current: totalItems, total: totalItems, percent: 100 });
      setPostResult({
        status: 'success',
        referenceNumber: data?.referenceNumber || cleanRef,
        postedCount: Number(data?.posted || totalItems),
        totalQuantity: Number(data?.totalQuantity ?? counts.totalQty),
        totalValue: Number(data?.totalValue ?? counts.totalVal),
        skippedCount: counts.skipped,
        failedCount: counts.error,
      });

      onBatchPosted({
        batchId: data?.batchId || '',
        referenceNumber: data?.referenceNumber || cleanRef,
        warehouseId,
        posted: Number(data?.posted || totalItems),
        totalQuantity: Number(data?.totalQuantity ?? counts.totalQty),
        totalValue: Number(data?.totalValue ?? counts.totalVal),
      });
    } catch (err: any) {
      window.clearInterval(ticker);
      const rawMsg = err?.response?.data?.message || err?.message || 'Atomic batch posting failed';
      setProgressCount({ current: 0, total: totalItems, percent: 0 });
      setPostResult({
        status: 'error',
        referenceNumber: cleanRef,
        postedCount: 0,
        totalQuantity: 0,
        totalValue: 0,
        skippedCount: counts.skipped,
        failedCount: totalItems,
        errorMessage: Array.isArray(rawMsg) ? rawMsg.join('; ') : String(rawMsg),
      });
    } finally {
      setExecuting(false);
    }
  };

  const previewColumns: ColumnsType<ValidatedOpeningStockRow> = [
    {
      title: 'Skip',
      key: 'skip',
      width: 55,
      align: 'center',
      render: (_, r) => (
        <Checkbox
          checked={!r.excludedByUser}
          onChange={(e) => updateRowField(r.key, { excludedByUser: !e.target.checked })}
        />
      ),
    },
    {
      title: 'Row #',
      dataIndex: 'rowNumber',
      width: 68,
      render: (n: number) => (
        <Text strong style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          #{n}
        </Text>
      ),
    },
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      width: 145,
      ellipsis: true,
      render: (v: string, r) => (
        <Text
          strong
          style={{
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            color: r.status === 'ERROR' ? token.colorError : token.colorPrimary,
          }}
        >
          {v || '—'}
        </Text>
      ),
    },
    {
      title: 'Item Name',
      dataIndex: 'itemName',
      width: 220,
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <span style={{ whiteSpace: 'nowrap' }}>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      width: 105,
      render: (v: string, r) => (
        <Select
          size="small"
          value={v || undefined}
          placeholder="UOM"
          style={{ width: '100%' }}
          onChange={(nextUom) => updateRowField(r.key, { uomCode: nextUom })}
          options={uoms.map((u) => ({ value: u.code || u.name || '', label: u.code || u.name || '' }))}
        />
      ),
    },
    {
      title: 'Opening Qty',
      dataIndex: 'quantity',
      width: 125,
      align: 'right',
      render: (_: number, r) => (
        <InputNumber
          size="small"
          controls={false}
          style={{ width: '100%', fontVariantNumeric: 'tabular-nums' }}
          value={r.quantityCell === '' ? null : Number(r.quantityCell)}
          placeholder="0"
          onChange={(val) =>
            updateRowField(r.key, {
              quantityCell: val === null || val === undefined ? '' : String(val),
              excludedByUser: false,
            })
          }
        />
      ),
    },
    {
      title: 'Unit Cost (PKR)',
      dataIndex: 'unitCost',
      width: 125,
      align: 'right',
      render: (_: number, r) => (
        <InputNumber
          size="small"
          controls={false}
          min={0}
          style={{ width: '100%', fontVariantNumeric: 'tabular-nums' }}
          value={r.unitCost || null}
          placeholder="0"
          onChange={(val) =>
            updateRowField(r.key, {
              unitCostCell: val === null || val === undefined ? '' : String(val),
            })
          }
        />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      align: 'center',
      render: (st: ValidatedOpeningStockRow['status']) => {
        if (st === 'READY') return <Tag color="success" style={{ margin: 0 }}>Ready</Tag>;
        if (st === 'SKIPPED') return <Tag color="default" style={{ margin: 0 }}>Skipped</Tag>;
        return <Tag color="error" style={{ margin: 0 }}>Error</Tag>;
      },
    },
    {
      title: 'Validation Details / Notes',
      key: 'details',
      width: 270,
      ellipsis: true,
      render: (_, r) => {
        if (r.status === 'ERROR') {
          const msg = r.errors.join('; ');
          return (
            <Tooltip title={msg}>
              <Text type="danger" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {msg}
              </Text>
            </Tooltip>
          );
        }
        if (r.status === 'SKIPPED') {
          return (
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {r.skipReason || 'Skipped'}
            </Text>
          );
        }
        return (
          <Input
            size="small"
            value={r.notes}
            placeholder="Optional notes"
            onChange={(e) => updateRowField(r.key, { notes: e.target.value })}
          />
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={executing ? undefined : onClose}
      closable={!executing}
      maskClosable={!executing}
      centered
      width={1140}
      title={
        <Space size={8}>
          <FileExcelOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
          <span>Opening Stock Excel / CSV Import Wizard</span>
        </Space>
      }
      footer={null}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Steps
          current={step}
          size="small"
          items={[
            { title: '1. Upload & Scope' },
            { title: '2. Validation & Preview' },
            { title: '3. Post Batch & Summary' },
          ]}
        />

        {/* STEP 1: UPLOAD & SCOPE */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 10,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  DIVISION
                </Text>
                <Select
                  allowClear
                  placeholder="All Divisions"
                  value={divisionId}
                  onChange={(v) => {
                    setDivisionId(v);
                    setWarehouseId(undefined);
                  }}
                  style={{ width: '100%' }}
                  showSearch
                  optionFilterProp="label"
                  options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  WAREHOUSE <span style={{ color: token.colorError }}>*</span>
                </Text>
                <Select
                  placeholder="Select Warehouse"
                  value={warehouseId}
                  onChange={setWarehouseId}
                  style={{ width: '100%' }}
                  showSearch
                  optionFilterProp="label"
                  options={scopedWarehouses.map((w) => ({
                    value: w.id,
                    label: `${w.warehouseCode || w.code || w.warehouse_code || ''} — ${w.name}`.replace(/^ — /, ''),
                  }))}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  BATCH REFERENCE #
                </Text>
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="OPN-YYYYMMDD-xxx"
                  style={{ fontFamily: 'monospace', fontWeight: 600 }}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  POSTING DATE
                </Text>
                <DatePicker
                  value={postingDate}
                  onChange={(d) => setPostingDate(d || dayjs())}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                Need a pre-filled file with all items in <Text strong>{selectedDivisionName}</Text>?
              </Text>
              <Button icon={<DownloadOutlined />} onClick={onOpenTemplateModal}>
                Download Pre-Filled Excel (.xlsx) / CSV Template
              </Button>
            </div>

            <Upload.Dragger
              name="file"
              accept=".xlsx,.xls,.csv,.txt"
              maxCount={1}
              showUploadList={false}
              disabled={parsing}
              beforeUpload={handleFileSelected}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                {parsing ? 'Parsing & validating spreadsheet...' : 'Click or drag an Excel (.xlsx / .xls) or CSV file here'}
              </p>
              <p className="ant-upload-hint">
                Rows with blank or 0 Opening Quantity are automatically skipped. Negative quantities, unknown codes, wrong division, or invalid UOMs are flagged in Step 2.
              </p>
            </Upload.Dragger>
          </div>
        )}

        {/* STEP 2: VALIDATION & PREVIEW */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Space wrap size={8}>
                <Tag style={{ margin: 0, padding: '4px 10px', fontWeight: 600 }}>
                  File: {fileName}
                </Tag>
                <Tag color="blue" style={{ margin: 0, padding: '4px 10px', fontWeight: 700 }}>
                  Total Rows in File: {counts.total}
                </Tag>
                <Tag color="success" style={{ margin: 0, padding: '4px 10px', fontWeight: 700 }}>
                  Ready to Import (Qty &gt; 0): {counts.ready}
                </Tag>
                <Tag color="default" style={{ margin: 0, padding: '4px 10px', fontWeight: 600 }}>
                  Skipped (Empty / Zero Qty): {counts.skipped}
                </Tag>
                <Tag color={counts.error > 0 ? 'error' : 'default'} style={{ margin: 0, padding: '4px 10px', fontWeight: 700 }}>
                  Validation Errors: {counts.error}
                </Tag>
              </Space>

              <Space wrap size={8}>
                {counts.error > 0 && (
                  <Button danger size="small" icon={<DownloadOutlined />} onClick={handleDownloadErrors}>
                    Download Error Rows CSV
                  </Button>
                )}
                <Button size="small" icon={<UploadOutlined />} onClick={() => setStep(0)}>
                  Change File
                </Button>
              </Space>
            </div>

            {counts.error > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${counts.error} row(s) have validation errors`}
                description="Fix quantities, UOMs, or uncheck problematic rows inline below, or download the Error Rows CSV. You can also post only the valid Ready rows right away."
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Segmented
                size="small"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as any)}
                options={[
                  { label: `All (${counts.total})`, value: 'ALL' },
                  { label: `Ready (${counts.ready})`, value: 'READY' },
                  { label: `Skipped (${counts.skipped})`, value: 'SKIPPED' },
                  { label: `Errors (${counts.error})`, value: 'ERROR' },
                ]}
              />

              {statusFilter === 'ALL' && (
                <Checkbox checked={hideSkippedInAll} onChange={(e) => setHideSkippedInAll(e.target.checked)}>
                  Hide Skipped (Zero/Empty) Rows
                </Checkbox>
              )}
            </div>

            <Table
              rowKey="key"
              size="small"
              className="erp-compact-table"
              columns={previewColumns}
              dataSource={displayedRows}
              scroll={{ x: 'max-content', y: 340 }}
              pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '250'] }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                Ready Summary: <Text strong>{counts.ready} items</Text> · Total Qty:{' '}
                <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{counts.totalQty.toLocaleString()}</Text> ·
                Total Value:{' '}
                <Text strong style={{ color: token.colorPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  PKR {counts.totalVal.toLocaleString()}
                </Text>
              </Text>
              <Space>
                <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  icon={<TableOutlined />}
                  disabled={counts.ready === 0}
                  onClick={handleCopyReadyLinesToGrid}
                >
                  Load into Entry Table
                </Button>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={counts.ready === 0}
                  onClick={handlePostBatchAtomically}
                >
                  Post {counts.ready} Ready Items Now
                </Button>
              </Space>
            </div>
          </div>
        )}

        {/* STEP 3: LIVE BATCH EXECUTION & SUMMARY */}
        {step === 2 && (
          <div style={{ padding: '12px 0' }}>
            {executing && (
              <div
                style={{
                  background: token.colorFillAlter,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: 10,
                  padding: '20px 24px',
                }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong style={{ fontSize: 15 }}>
                      Processing {progressCount.current} of {progressCount.total} items atomically...
                    </Text>
                    <Tag color="processing" style={{ margin: 0, fontWeight: 700 }}>
                      {progressCount.percent}%
                    </Tag>
                  </div>
                  <Progress percent={progressCount.percent} status="active" />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Writing ledger IN entries, syncing warehouse inventory balances, and calculating weighted average unit costs for Batch {referenceNumber}.
                  </Text>
                </Space>
              </div>
            )}

            {!executing && postResult?.status === 'success' && (
              <Result
                status="success"
                icon={<CheckCircleOutlined />}
                title={`Opening Stock Batch Posted (${postResult.referenceNumber})`}
                subTitle="All ready items have been posted atomically to the stock ledger and warehouse inventory balances."
                extra={[
                  <Button
                    key="history"
                    icon={<HistoryOutlined />}
                    onClick={() => {
                      onClose();
                      onViewHistory();
                    }}
                  >
                    Open Batch History
                  </Button>,
                  <Button key="done" type="primary" onClick={onClose}>
                    Done
                  </Button>,
                ]}
              >
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Batch Reference #">
                    <Text strong style={{ fontFamily: 'monospace' }}>{postResult.referenceNumber}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Items Posted">
                    <Tag color="green" style={{ margin: 0, fontWeight: 700 }}>{postResult.postedCount}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Total Quantity">
                    <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {postResult.totalQuantity.toLocaleString()}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Total Value (PKR)">
                    <Text strong style={{ color: token.colorPrimary, fontVariantNumeric: 'tabular-nums' }}>
                      PKR {postResult.totalValue.toLocaleString()}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Skipped (Zero / Blank)">
                    {postResult.skippedCount}
                  </Descriptions.Item>
                  <Descriptions.Item label="Failed / Validation Excluded">
                    {postResult.failedCount}
                  </Descriptions.Item>
                </Descriptions>
              </Result>
            )}

            {!executing && postResult?.status === 'error' && (
              <Result
                status="error"
                icon={<CloseCircleOutlined />}
                title="Opening Stock Import Failed (Rolled Back)"
                subTitle={postResult.errorMessage || 'Transaction failed cleanly with zero partial changes.'}
                extra={[
                  <Button key="back" type="primary" onClick={() => setStep(1)}>
                    Back to Validation Preview
                  </Button>,
                  <Button key="close" onClick={onClose}>
                    Close
                  </Button>,
                ]}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default OpeningStockImportWizardModal;
