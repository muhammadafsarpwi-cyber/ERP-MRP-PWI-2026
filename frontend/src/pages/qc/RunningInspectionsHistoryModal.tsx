import React, { useState, useMemo } from 'react';
import {
  Modal,
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
  Divider,
  Popconfirm,
  theme,
} from 'antd';
import {
  HistoryOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  WhatsAppOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
  EyeOutlined,
  PrinterOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { QmsInProcessInspection, InspectionSampleRow } from './types';
import { exportQmsToPdf } from './exportQmsPdf';
import { shareQmsOnWhatsApp } from './exportQmsWhatsApp';

interface RunningInspectionsHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  inspections: QmsInProcessInspection[];
  onSelectInspection: (inspection: QmsInProcessInspection) => void;
  onOpenSheet: (inspection: QmsInProcessInspection) => void;
  onEditInspection?: (inspection: QmsInProcessInspection) => void;
  onDeleteInspection?: (inspection: QmsInProcessInspection) => void;
  onRefresh?: () => void;
}

export const RunningInspectionsHistoryModal: React.FC<RunningInspectionsHistoryModalProps> = ({
  visible,
  onClose,
  inspections,
  onSelectInspection,
  onOpenSheet,
  onEditInspection,
  onDeleteInspection,
  onRefresh,
}) => {
  const { token } = theme.useToken();

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

  const [searchText, setSearchText] = useState('');
  const [filterShift, setFilterShift] = useState('ALL');
  const [filterResult, setFilterResult] = useState('ALL');

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
      width: 170,
      render: (_, r) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontWeight: 700,
                color: token.colorPrimary,
                fontSize: '13px',
                cursor: 'pointer',
              }}
              onClick={() => {
                onSelectInspection(r);
                onClose();
              }}
            >
              {r.inspectionNo}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary, marginTop: '2px' }}>
            Doc: <strong>{r.docRef}</strong> (Rev: {r.revNo})
          </div>
        </div>
      ),
    },
    {
      title: 'Date & Shift',
      key: 'dt',
      width: 130,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '12px' }}>{r.inspectionDate}</div>
          <Tag color="cyan" style={{ fontSize: '11px', margin: '2px 0 0 0' }}>
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
          <div style={{ fontWeight: 600, fontSize: '12px' }}>{r.machineNo}</div>
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
            <Tag color="blue" style={{ fontSize: '11px', margin: 0 }}>
              {r.itemCode}
            </Tag>
            <span style={{ fontSize: '11px', color: token.colorTextTertiary }}>
              {r.samples?.length || 0} Dimensional Specs
            </span>
          </div>
          {/* Quick Specs inline pill */}
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
      width: 100,
      align: 'center',
      render: (res: string) => renderSolidBadge(res),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 350,
      align: 'right',
      render: (_, r) => (
        <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
          {onEditInspection && (
            <Tooltip title="Edit / Revise this inspection">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  onEditInspection(r);
                  onClose();
                }}
              >
                Edit
              </Button>
            </Tooltip>
          )}

          <Tooltip title="Load this inspection into main view">
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                onSelectInspection(r);
                onClose();
              }}
            >
              Load
            </Button>
          </Tooltip>

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
      ),
    },
  ];

  // Expandable row rendering full dimensional sample grid
  const expandedRowRender = (record: QmsInProcessInspection) => {
    return (
      <Card
        size="small"
        bordered
        style={{
          margin: '4px 0 12px 0',
          backgroundColor: token.colorFillAlter,
          borderColor: token.colorBorderSecondary,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <Typography.Text strong style={{ fontSize: '13px' }}>
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
                onClick={() => {
                  onEditInspection(record);
                  onClose();
                }}
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
              icon={<CheckCircleOutlined />}
              onClick={() => {
                onSelectInspection(record);
                onClose();
              }}
            >
              Load on Main Page
            </Button>
            {onDeleteInspection && (
              <Popconfirm
                title="Delete Inspection Record?"
                description={`Permanently delete inspection "${record.inspectionNo}"? This action cannot be undone.`}
                okText="Yes, Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                onConfirm={() => onDeleteInspection(record)}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                >
                  Delete
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        {/* 5-Sample Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${token.colorBorder}` }}>
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
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s1}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s2}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s3}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s4}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{s.s5}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                    {avg.toFixed(2)} {s.unit}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {renderSolidBadge(isPass ? 'PASS' : 'FAIL')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Visual Attributes summary */}
        {record.attributes && record.attributes.length > 0 && (
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px dashed ${token.colorBorderSecondary}` }}>
            <span style={{ fontSize: '11px', fontWeight: 700, marginRight: '10px', color: token.colorTextSecondary }}>
              Visual &amp; Functional Checks (Go / No-Go):
            </span>
            <Space size="middle" wrap>
              {record.attributes.map((a) => (
                <Tag key={a.id} color={a.defectsQty === 0 ? 'success' : 'error'} style={{ fontSize: '11px' }}>
                  {a.checkName}: {a.checkedQty || 10} / {a.defectsQty || 0} defects
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
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HistoryOutlined style={{ color: token.colorPrimary, fontSize: '18px' }} />
          <div>
            <span style={{ fontSize: '16px', fontWeight: 700, color: token.colorTextHeading }}>
              Running Production Inspections Register &amp; History
            </span>
            <div style={{ fontSize: '12px', fontWeight: 400, color: token.colorTextSecondary }}>
              Centrally browse, filter, inspect 5-sample logs, and export QMS reports
            </div>
          </div>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
      width={1180}
      centered
      destroyOnClose
    >
      {/* Top Filter Bar */}
      <Card
        size="small"
        style={{
          marginBottom: '14px',
          borderColor: token.colorBorderSecondary,
          backgroundColor: token.colorFillAlter,
        }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={10} md={10}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
              placeholder="Search by Inspection #, Part Code, Name, Operator, Machine..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={5} md={5}>
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
          <Col xs={12} sm={5} md={5}>
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
          <Col xs={24} sm={4} md={4} style={{ textAlign: 'right' }}>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setSearchText('');
                  setFilterShift('ALL');
                  setFilterResult('ALL');
                  if (onRefresh) onRefresh();
                }}
              >
                Reset
              </Button>
              {onRefresh && (
                <Button icon={<ReloadOutlined />} onClick={onRefresh}>
                  Refresh
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Main Inspections Table with Expandable Samples Breakdown */}
      <Table
        size="small"
        scroll={{ x: 1000 }}
        columns={columns}
        dataSource={filteredList}
        rowKey="id"
        pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: ['8', '15', '30'] }}
        expandable={{
          expandedRowRender,
          rowExpandable: () => true,
        }}
        locale={{
          emptyText: 'No running production inspection records found matching criteria',
        }}
      />
    </Modal>
  );
};
