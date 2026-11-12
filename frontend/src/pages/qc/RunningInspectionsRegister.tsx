import React, { useState, useMemo } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Row,
  Col,
  Card,
  Typography,
  Tooltip,
  Popconfirm,
  theme,
  App,
} from 'antd';
import {
  SearchOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  WhatsAppOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowsAltOutlined,
  ShrinkOutlined,
  ArrowUpOutlined,
  CheckSquareFilled,
  ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { QmsInProcessInspection } from './types';
import { exportQmsToPdf, exportBatchQmsToPdf } from './exportQmsPdf';
import { shareQmsOnWhatsApp, shareBatchQmsOnWhatsApp } from './exportQmsWhatsApp';

interface RunningInspectionsRegisterProps {
  inspections: QmsInProcessInspection[];
  activeInspectionId: string;
  onSelectInspection: (inspection: QmsInProcessInspection) => void;
  onOpenSheet: (inspection: QmsInProcessInspection, batchList?: QmsInProcessInspection[]) => void;
  onEditInspection?: (inspection: QmsInProcessInspection) => void;
  onDeleteInspection?: (inspection: QmsInProcessInspection) => void;
  onRefresh?: () => void;
}

export const RunningInspectionsRegister: React.FC<RunningInspectionsRegisterProps> = ({
  inspections,
  activeInspectionId,
  onSelectInspection,
  onOpenSheet,
  onEditInspection,
  onDeleteInspection,
  onRefresh,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [searchText, setSearchText] = useState('');
  const [filterShift, setFilterShift] = useState('ALL');
  const [filterResult, setFilterResult] = useState('ALL');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<QmsInProcessInspection[]>([]);

  // Selected inspections list (fallback by id or inspectionNo)
  const selectedInspections = useMemo(() => {
    if (selectedRows.length > 0 && selectedRows.length === selectedRowKeys.length) {
      return selectedRows;
    }
    return inspections.filter((item) => selectedRowKeys.includes(item.id || item.inspectionNo));
  }, [inspections, selectedRowKeys, selectedRows]);

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[], newSelectedRows: QmsInProcessInspection[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
      setSelectedRows(newSelectedRows);
    },
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
    ],
  };

  const renderSolidBadge = (status: string) => {
    const isFail = status === 'FAIL';
    const isPass = status === 'PASS';
    const bg = isFail ? '#ef4444' : isPass ? '#10b981' : '#2563eb';
    return (
      <span
        style={{
          display: 'inline-block',
          backgroundColor: bg,
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '11px',
          padding: '3px 10px',
          borderRadius: '4px',
          letterSpacing: '0.5px',
          minWidth: '58px',
          textAlign: 'center',
          boxShadow: `0 1px 3px ${isFail ? 'rgba(239, 68, 68, 0.4)' : isPass ? 'rgba(16, 185, 129, 0.4)' : 'rgba(37, 99, 235, 0.4)'}`,
        }}
      >
        {status || 'PENDING'}
      </span>
    );
  };

  // Filtered dataset
  const filteredList = useMemo(() => {
    return inspections.filter((item) => {
      if (filterShift !== 'ALL' && item.shift !== filterShift) return false;
      if (filterResult !== 'ALL' && item.overallResult !== filterResult) return false;

      if (searchText.trim()) {
        const query = searchText.trim().toLowerCase();
        const no = (item.inspectionNo || '').toLowerCase();
        const code = (item.itemCode || '').toLowerCase();
        const name = (item.itemName || '').toLowerCase();
        const op = (item.operatorName || '').toLowerCase();
        const mc = (item.machineNo || '').toLowerCase();
        const doc = (item.docRef || '').toLowerCase();
        return (
          no.includes(query) ||
          code.includes(query) ||
          name.includes(query) ||
          op.includes(query) ||
          mc.includes(query) ||
          doc.includes(query)
        );
      }
      return true;
    });
  }, [inspections, filterShift, filterResult, searchText]);

  // Handle direct WhatsApp share
  const handleShareWhatsApp = (insp: QmsInProcessInspection) => {
    shareQmsOnWhatsApp(insp);
  };

  const columns: ColumnsType<QmsInProcessInspection> = [
    {
      title: 'Inspection # & Doc',
      key: 'inspectionNo',
      width: 175,
      render: (_, r) => {
        const isActive = r.id === activeInspectionId;
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontWeight: 700,
                  color: isActive ? token.colorPrimary : token.colorText,
                  fontSize: '13px',
                }}
              >
                {r.inspectionNo}
              </span>
              {isActive && (
                <Tag color="processing" style={{ fontSize: '10px', lineHeight: '16px', padding: '0 6px', margin: 0, fontWeight: 700 }}>
                  Active
                </Tag>
              )}
            </div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, marginTop: '2px' }}>
              Doc: <strong>{r.docRef}</strong> (Rev: {r.revNo})
            </div>
          </div>
        );
      },
    },
    {
      title: 'Date & Shift',
      key: 'dt',
      width: 130,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '12px', color: token.colorText }}>{r.inspectionDate}</div>
          <Tag color="cyan" style={{ fontSize: '11px', margin: '2px 0 0 0', fontWeight: 600 }}>
            Shift {r.shift}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Machine & Operator',
      key: 'machine',
      width: 160,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '12px', color: token.colorText }}>{r.machineNo}</div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
            Op: {r.operatorName} | Insp: {r.inspectorName}
          </div>
        </div>
      ),
    },
    {
      title: 'Item / Part Specifications',
      key: 'item',
      minWidth: 260,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 700, color: token.colorTextHeading, fontSize: '13px' }}>
            {r.itemName || r.itemCode}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ fontSize: '11px', margin: 0, fontWeight: 600 }}>
              {r.itemCode}
            </Tag>
            <span style={{ fontSize: '11px', color: token.colorTextSecondary }}>
              {r.samples?.length || 0} Dimensional Specs
            </span>
          </div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary, marginTop: '4px' }}>
            {r.samples?.slice(0, 3).map((s) => (
              <span key={s.id} style={{ marginRight: '8px', display: 'inline-block' }}>
                {s.charName}: <strong>{Number(s.average || 0).toFixed(1)}{s.unit}</strong>
              </span>
            ))}
            {(r.samples?.length || 0) > 3 && <span>...</span>}
          </div>
        </div>
      ),
    },
    {
      title: 'Result',
      dataIndex: 'overallResult',
      key: 'result',
      width: 95,
      align: 'center',
      render: (res: string) => renderSolidBadge(res),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 320,
      align: 'right',
      render: (_, r) => {
        const isActive = r.id === activeInspectionId;
        return (
          <Space size={4} wrap style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
            <Tooltip title="View this inspection sheet on top">
              <Button
                size="small"
                type={isActive ? 'primary' : 'default'}
                icon={isActive ? <CheckCircleOutlined /> : <ArrowUpOutlined />}
                onClick={() => onSelectInspection(r)}
                style={{
                  fontWeight: 700,
                  fontSize: '11px',
                }}
              >
                {isActive ? 'Viewing' : 'Load Sheet'}
              </Button>
            </Tooltip>

            {onEditInspection && (
              <Tooltip title="Edit / Revise this inspection">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => onEditInspection(r)}
                >
                  Edit
                </Button>
              </Tooltip>
            )}

            <Tooltip title="View Printable QMS Sheet">
              <Button
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => onOpenSheet(r)}
              >
                Sheet
              </Button>
            </Tooltip>

            <Tooltip title="Download A4 PDF Report">
              <Button
                size="small"
                icon={<FilePdfOutlined />}
                onClick={() => exportQmsToPdf(r)}
              />
            </Tooltip>

            <Tooltip title="Share on WhatsApp">
              <Button
                size="small"
                style={{ color: '#25D366' }}
                icon={<WhatsAppOutlined />}
                onClick={() => handleShareWhatsApp(r)}
              />
            </Tooltip>

            {onDeleteInspection && (
              <Popconfirm
                title="Delete Inspection Record?"
                description={`Permanently delete inspection "${r.inspectionNo}"? This action cannot be undone.`}
                okText="Yes, Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                placement="left"
                onConfirm={() => onDeleteInspection(r)}
              >
                <Button
                  size="small"
                  danger
                  title="Delete Inspection"
                  icon={<DeleteOutlined />}
                />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  // Expandable row rendering full dimensional sample grid
  const expandedRowRender = (record: QmsInProcessInspection) => {
    return (
      <Card
        size="small"
        bordered
        style={{
          margin: '6px 0 12px 0',
          backgroundColor: token.colorFillAlter,
          borderColor: token.colorBorderSecondary,
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <Typography.Text strong style={{ fontSize: '13px', color: token.colorTextHeading }}>
              Full Dimensional Measurements &amp; 5-Sample Log ({record.inspectionNo})
            </Typography.Text>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
              Standard: {record.docRef} (Rev: {record.revNo}) | Issue Date: {record.issueDate}
            </div>
          </div>
          <Space>
            {onEditInspection && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEditInspection(record)}
              >
                Edit / Revise
              </Button>
            )}
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => onOpenSheet(record)}
            >
              Print Preview
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<ArrowUpOutlined />}
              onClick={() => onSelectInspection(record)}
            >
              Load on Top Sheet
            </Button>
          </Space>
        </div>

        {/* 5-Sample Table */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: token.colorFillAlter, borderBottom: `2px solid ${token.colorBorder}` }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Characteristic</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Dimension Requirement</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Tol (+)</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Tol (-)</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>S1</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>S2</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>S3</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>S4</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>S5</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Average</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {record.samples?.map((s, idx) => {
                const avg = Number(s.average || 0);
                const min = s.nominal - s.tolMinus;
                const max = s.nominal + s.tolPlus;
                const isPass = avg >= min && avg <= max;
                return (
                  <tr
                    key={s.id || idx}
                    style={{
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{s.charName}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {s.nominal} {s.unit}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>+{s.tolPlus}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>-{s.tolMinus}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s1 ?? '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s2 ?? '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s3 ?? '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s4 ?? '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s5 ?? '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                      {s.average ? `${avg.toFixed(2)} ${s.unit}` : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {renderSolidBadge(isPass ? 'PASS' : 'FAIL')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Visual Attributes summary */}
        {record.attributes && record.attributes.length > 0 && (
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px dashed ${token.colorBorderSecondary}` }}>
            <span style={{ fontSize: '11px', fontWeight: 700, marginRight: '10px', color: token.colorTextSecondary }}>
              Visual &amp; Structural Checks (GO / NO-GO):
            </span>
            <Space size="middle" wrap>
              {record.attributes.map((a) => (
                <Tag key={a.id} color={a.defectsQty === 0 ? 'success' : 'error'} style={{ fontSize: '11px' }}>
                  {a.checkName}: {a.checkedQty || 10} pcs / {a.defectsQty || 0} defects
                </Tag>
              ))}
            </Space>
          </div>
        )}

        <div style={{ marginTop: '8px', fontSize: '11px', color: token.colorTextSecondary }}>
          <strong>Remarks:</strong> {record.remarks || 'Ok'} | <strong>Inspector:</strong> {record.inspectorName} | <strong>Approved By:</strong> {record.approvedBy}
        </div>
      </Card>
    );
  };

  return (
    <Card
      id="qc-inspections-register"
      size="small"
      style={{
        borderRadius: '12px',
        backgroundColor: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              Running Production Inspections Register &amp; History
            </Typography.Title>
            <Tag color="blue" style={{ fontWeight: 700 }}>
              {filteredList.length} Records
            </Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
            Click any row to display its complete official sheet above, or click the diagonal expand icon ↖↘ to view 5-sample logs in-place.
          </Typography.Text>
        </div>

        <Space>
          {onRefresh && (
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              Refresh
            </Button>
          )}
        </Space>
      </div>

      {/* Filter Toolbar */}
      <Card
        size="small"
        bordered
        style={{
          marginBottom: '12px',
          borderColor: token.colorBorderSecondary,
          backgroundColor: token.colorFillAlter,
          borderRadius: '8px',
        }}
      >
        <Row gutter={[10, 10]} align="middle">
          <Col xs={24} sm={11} md={12}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
              placeholder="Search by Inspection #, Part Code, Name, Operator, Machine..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              style={{ width: '100%' }}
              value={filterShift}
              onChange={setFilterShift}
              options={[
                { value: 'ALL', label: 'All Shifts' },
                { value: 'G', label: 'Shift G (General)' },
                { value: 'A', label: 'Shift A' },
                { value: 'B', label: 'Shift B' },
                { value: 'C', label: 'Shift C' },
              ]}
            />
          </Col>
          <Col xs={12} sm={4} md={4}>
            <Select
              style={{ width: '100%' }}
              value={filterResult}
              onChange={setFilterResult}
              options={[
                { value: 'ALL', label: 'All Results' },
                { value: 'PASS', label: 'PASS Only' },
                { value: 'FAIL', label: 'Out of Spec (FAIL)' },
              ]}
            />
          </Col>
          <Col xs={24} sm={3} md={3} style={{ textAlign: 'right' }}>
            <Button
              onClick={() => {
                setSearchText('');
                setFilterShift('ALL');
                setFilterResult('ALL');
                if (onRefresh) onRefresh();
              }}
              style={{ width: '100%' }}
            >
              Reset
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Batch Action Toolbar when Checkboxes are selected */}
      {selectedRowKeys.length > 0 && (
        <Card
          size="small"
          bordered
          style={{
            marginBottom: '12px',
            backgroundColor: token.colorPrimaryBg,
            borderColor: token.colorPrimaryBorder,
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Tag color="processing" style={{ fontSize: '13px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px' }}>
                <CheckSquareFilled style={{ marginRight: '6px' }} />
                {selectedRowKeys.length} {selectedRowKeys.length === 1 ? 'Record' : 'Records'} Selected
              </Tag>
              <Button
                type="link"
                size="small"
                icon={<ClearOutlined />}
                onClick={() => setSelectedRowKeys([])}
                style={{ fontSize: '12px', color: token.colorTextSecondary }}
              >
                Clear Selection
              </Button>
            </div>

            <Space wrap size="small">
              <Button
                icon={<FileTextOutlined />}
                onClick={() => {
                  const targetList = selectedInspections.length > 0 ? selectedInspections : filteredList.slice(0, 1);
                  onOpenSheet(targetList[0], targetList);
                }}
                style={{ fontWeight: 600 }}
              >
                Print View Selected ({selectedRowKeys.length})
              </Button>

              <Button
                danger
                type="primary"
                icon={<FilePdfOutlined />}
                onClick={() => {
                  try {
                    const filename = exportBatchQmsToPdf(selectedInspections);
                    message.success(`Batch PDF generated with ${selectedRowKeys.length} records: ${filename}`);
                  } catch (e) {
                    message.error('Failed to generate batch PDF');
                  }
                }}
                style={{ fontWeight: 700 }}
              >
                Download Combined PDF ({selectedRowKeys.length})
              </Button>

              <Button
                style={{ color: '#25D366', borderColor: '#25D366', fontWeight: 600 }}
                icon={<WhatsAppOutlined />}
                onClick={() => shareBatchQmsOnWhatsApp(selectedInspections)}
              >
                WhatsApp Share Selected ({selectedRowKeys.length})
              </Button>
            </Space>
          </div>
        </Card>
      )}

      {/* Main Inspections Table with Checkbox Row Selection & Diagonal Expand Icon (↖↘) */}
      <Table
        size="small"
        scroll={{ x: 1000 }}
        columns={columns}
        dataSource={filteredList}
        rowKey={(record) => record.id || record.inspectionNo}
        rowSelection={rowSelection}
        rowClassName={(record) => (record.id === activeInspectionId ? 'qc-row-active' : '')}
        onRow={(record) => ({
          onClick: () => onSelectInspection(record),
          style: { cursor: 'pointer' },
        })}
        pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: ['8', '15', '30'] }}
        expandable={{
          expandedRowRender,
          rowExpandable: () => true,
          expandIcon: ({ expanded, onExpand, record }) => (
            <Button
              type="text"
              size="small"
              icon={
                expanded ? (
                  <ShrinkOutlined style={{ fontSize: '13px', color: token.colorPrimary }} />
                ) : (
                  <ArrowsAltOutlined style={{ fontSize: '13px', color: token.colorPrimary }} />
                )
              }
              onClick={(e) => {
                e.stopPropagation();
                onExpand(record, e);
              }}
              style={{
                width: '26px',
                height: '26px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                backgroundColor: expanded ? token.colorFillAlter : token.colorBgContainer,
                border: `1.5px solid ${expanded ? token.colorPrimary : token.colorBorderSecondary}`,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.2s ease',
              }}
              title={expanded ? 'Collapse 5-sample details' : 'Expand 5-sample logs & details'}
            />
          ),
        }}
        locale={{
          emptyText: 'No running production inspection records found matching criteria',
        }}
      />
    </Card>
  );
};

