import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  Select,
  Radio,
  Space,
  Button,
  Typography,
  Tag,
  Alert,
  App,
  theme,
} from 'antd';
import {
  FileExcelOutlined,
  FileTextOutlined,
  DownloadOutlined,
  UploadOutlined,
  ApartmentOutlined,
  ShopOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  buildOpeningStockCsvContent,
  buildOpeningStockXlsxBlob,
  filterTemplateItems,
  formatCategoryTypeLabel,
  type TemplateItemRecord,
} from '../../utils/openingStockSpreadsheet';

const { Text } = Typography;

export interface OpeningStockTemplateModalProps {
  open: boolean;
  onClose: () => void;
  divisions: Array<{ id: string; name: string }>;
  warehouses: Array<{ id: string; name: string; code?: string; warehouseCode?: string; warehouse_code?: string; divisionId?: string; division_id?: string }>;
  selectedDivisionId?: string;
  selectedWarehouseId?: string;
  allItems: TemplateItemRecord[];
  warehouseBalances: Map<string, number>;
  onSelectScope?: (divisionId?: string, warehouseId?: string) => void;
  onOpenImportWizard?: () => void;
}

export const OpeningStockTemplateModal: React.FC<OpeningStockTemplateModalProps> = ({
  open,
  onClose,
  divisions,
  warehouses,
  selectedDivisionId,
  selectedWarehouseId,
  allItems,
  warehouseBalances,
  onSelectScope,
  onOpenImportWizard,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  const [divisionScope, setDivisionScope] = useState<string>(selectedDivisionId || 'ALL');
  const [warehouseScope, setWarehouseScope] = useState<string | undefined>(selectedWarehouseId);
  const [filterMode, setFilterMode] = useState<'ALL' | 'ZERO_STOCK' | 'CATEGORY'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [fileFormat, setFileFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open) {
      setDivisionScope(selectedDivisionId || 'ALL');
      setWarehouseScope(selectedWarehouseId);
      setFilterMode('ALL');
      setSelectedCategory(undefined);
    }
  }, [open, selectedDivisionId, selectedWarehouseId]);

  const scopedWarehouses = useMemo(() => {
    if (divisionScope === 'ALL') return warehouses;
    return warehouses.filter((w) => (w.divisionId || w.division_id) === divisionScope);
  }, [warehouses, divisionScope]);

  useEffect(() => {
    if (!open) return;
    if (warehouseScope && scopedWarehouses.some((w) => w.id === warehouseScope)) return;
    if (scopedWarehouses.length > 0) {
      setWarehouseScope(scopedWarehouses[0].id);
    } else {
      setWarehouseScope(undefined);
    }
  }, [open, scopedWarehouses, warehouseScope]);

  const scopedItems = useMemo(() => {
    if (divisionScope === 'ALL') return allItems;
    return allItems.filter((it) => !it.divisionId || it.divisionId === divisionScope);
  }, [allItems, divisionScope]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of scopedItems) {
      const label = formatCategoryTypeLabel(it);
      map.set(label, (map.get(label) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({
        value: label,
        label: `${label} (${count})`,
      }));
  }, [scopedItems]);

  const matchedItems = useMemo(
    () =>
      filterTemplateItems({
        divisionName: '',
        warehouseName: '',
        filterMode,
        selectedCategory,
        items: scopedItems,
        balances: warehouseBalances,
      }),
    [scopedItems, warehouseBalances, filterMode, selectedCategory],
  );

  const selectedDivisionName = useMemo(() => {
    if (divisionScope === 'ALL') return 'All Divisions';
    return divisions.find((d) => d.id === divisionScope)?.name || 'Selected Division';
  }, [divisionScope, divisions]);

  const selectedWarehouseName = useMemo(() => {
    const w = warehouses.find((wh) => wh.id === warehouseScope);
    return w?.name || 'All Division Warehouses';
  }, [warehouseScope, warehouses]);

  const handleDownload = () => {
    if (matchedItems.length === 0) {
      message.warning('No active items match the selected filters.');
      return;
    }
    if (filterMode === 'CATEGORY' && !selectedCategory) {
      message.warning('Please select a category or switch filter mode.');
      return;
    }

    setDownloading(true);
    try {
      const safeDivSlug = selectedDivisionName
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const stamp = dayjs().format('YYYYMMDD');
      const opts = {
        divisionName: selectedDivisionName,
        warehouseName: selectedWarehouseName,
        filterMode,
        selectedCategory,
        items: scopedItems,
        balances: warehouseBalances,
        generatedAt: dayjs().format('YYYY-MM-DD HH:mm'),
      };

      if (fileFormat === 'xlsx') {
        const { blob, rowCount } = buildOpeningStockXlsxBlob(opts);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Opening_Stock_Template_${safeDivSlug}_${stamp}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success(`Downloaded Excel (.xlsx) template with ${rowCount} pre-filled item(s)`);
      } else {
        const { content, rowCount } = buildOpeningStockCsvContent(opts);
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Opening_Stock_Template_${safeDivSlug}_${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success(`Downloaded CSV template with ${rowCount} pre-filled item(s)`);
      }

      if (onSelectScope && divisionScope !== 'ALL') {
        onSelectScope(divisionScope, warehouseScope);
      }
      onClose();
    } catch (err: any) {
      message.error(err?.message || 'Failed to generate template');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={620}
      destroyOnHidden
      title={
        <Space size={8}>
          <FileExcelOutlined style={{ color: token.colorSuccess, fontSize: 18 }} />
          <span>Download Opening Stock Template</span>
        </Space>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            {onOpenImportWizard && (
              <Button icon={<UploadOutlined />} onClick={onOpenImportWizard}>
                Go to Import Wizard
              </Button>
            )}
          </div>
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={downloading}
              disabled={matchedItems.length === 0}
              onClick={handleDownload}
            >
              Download .{fileFormat} Template ({matchedItems.length} Items)
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
        <Alert
          type="info"
          showIcon
          message="Pre-Filled Division Inventory Template"
          description="Every active item is pre-populated with Item Code, Item Name, Category, UOM, and Current Stock. Simply type Opening Quantity beside the items you want to post — blank or zero rows are automatically skipped."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <ApartmentOutlined style={{ marginRight: 5, color: token.colorPrimary }} />
              Division
            </Text>
            <Select
              value={divisionScope}
              onChange={(v) => {
                setDivisionScope(v);
                setSelectedCategory(undefined);
              }}
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'ALL', label: 'All Divisions' },
                ...divisions.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>

          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <ShopOutlined style={{ marginRight: 5, color: token.colorInfo }} />
              Warehouse (Reference Stock)
            </Text>
            <Select
              value={warehouseScope}
              onChange={setWarehouseScope}
              placeholder="Select warehouse"
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={scopedWarehouses.map((w) => ({
                value: w.id,
                label: `${w.warehouseCode || w.code || w.warehouse_code || ''} — ${w.name}`.replace(/^ — /, ''),
              }))}
            />
          </div>
        </div>

        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            <FilterOutlined style={{ marginRight: 5, color: token.colorWarning }} />
            Items to Include in Template
          </Text>
          <Radio.Group
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Radio value="ALL">
                <span>All Active Items in Scope</span>{' '}
                <Tag color="blue" style={{ marginLeft: 4 }}>{scopedItems.length}</Tag>
              </Radio>
              <Radio value="ZERO_STOCK">
                <span>Zero-Stock Items Only (Current Stock = 0)</span>{' '}
                <Tag color="orange" style={{ marginLeft: 4 }}>
                  {scopedItems.filter((it) => (warehouseBalances.get(it.id) || 0) <= 0).length}
                </Tag>
              </Radio>
              <Radio value="CATEGORY">Selected Category / Type</Radio>
            </Space>
          </Radio.Group>

          {filterMode === 'CATEGORY' && (
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              placeholder="Select item category or type"
              style={{ width: '100%', marginTop: 8 }}
              showSearch
              optionFilterProp="label"
              options={categoryOptions}
            />
          )}
        </div>

        <div>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            File Format
          </Text>
          <Radio.Group
            value={fileFormat}
            onChange={(e) => setFileFormat(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="xlsx">
              <Space size={5}>
                <FileExcelOutlined />
                <span>Excel Workbook (.xlsx)</span>
              </Space>
            </Radio.Button>
            <Radio.Button value="csv">
              <Space size={5}>
                <FileTextOutlined />
                <span>CSV File (.csv)</span>
              </Space>
            </Radio.Button>
          </Radio.Group>
        </div>

        <div
          style={{
            background: token.colorFillAlter,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 8,
            padding: '10px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            Template columns: <Text strong>ITEM CODE · ITEM NAME · CATEGORY · UOM · CURRENT STOCK · OPENING QUANTITY · UNIT COST · BATCH # · SERIAL # · NOTES</Text>
          </Text>
          <Tag color={matchedItems.length > 0 ? 'green' : 'default'} style={{ margin: 0, fontWeight: 700 }}>
            {matchedItems.length} item{matchedItems.length === 1 ? '' : 's'} ready
          </Tag>
        </div>
      </div>
    </Modal>
  );
};

export default OpeningStockTemplateModal;
