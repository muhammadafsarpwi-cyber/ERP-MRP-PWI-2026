import React from 'react';
import { Modal, Button, Table, Tag, theme } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatDecimal } from '../../../utils/numberFormat';
import '../storeResponsive.css';

export type StoreVoucherType = 'GRN' | 'MIR' | 'MTN' | 'RGP' | 'NRGP';

export interface StoreVoucherLine {
  key?: string | number;
  lineNumber?: number;
  itemCode?: string;
  itemName: string;
  uomCode?: string;
  quantity: number;
  returnedQty?: number;
  remarks?: string;
}

export interface StoreVoucherData {
  type: StoreVoucherType;
  documentNumber: string;
  date?: string;
  status?: string;
  divisionName?: string;
  storeName?: string;
  destinationStoreName?: string;
  departmentName?: string;
  partyName?: string;
  vehicleNumber?: string;
  expectedReturnDate?: string;
  purpose?: string;
  remarks?: string;
  lines: StoreVoucherLine[];
}

interface StoreVoucherPrintModalProps {
  open: boolean;
  onClose: () => void;
  voucher: StoreVoucherData | null;
}

const VOUCHER_TITLES: Record<StoreVoucherType, string> = {
  GRN: 'GOODS RECEIPT NOTE (GRN)',
  MIR: 'MATERIAL ISSUE REQUISITION (MIR)',
  MTN: 'MATERIAL TRANSFER NOTE (MTN)',
  RGP: 'RETURNABLE GATE PASS (RGP)',
  NRGP: 'NON-RETURNABLE GATE PASS (NRGP)',
};

export const StoreVoucherPrintModal: React.FC<StoreVoucherPrintModalProps> = ({
  open,
  onClose,
  voucher,
}) => {
  const { token } = theme.useToken();

  if (!voucher) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={860}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 28 }}>
          <span>{VOUCHER_TITLES[voucher.type]} — {voucher.documentNumber}</span>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
            Print Voucher
          </Button>
        </div>
      }
      footer={[
        <Button key="close" onClick={onClose}>Close</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
          Print Slip
        </Button>,
      ]}
    >
      <div
        className="store-print-voucher-sheet"
        style={{
          padding: 20,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 8,
          background: token.colorBgContainer,
          color: token.colorText,
        }}
      >
        {/* Company Header */}
        <div
          style={{
            textAlign: 'center',
            borderBottom: `2px solid ${token.colorBorder}`,
            paddingBottom: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.6 }}>
            PAKISTAN WIRE INDUSTRIES (PVT.) LTD.
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
            {VOUCHER_TITLES[voucher.type]}
          </div>
        </div>

        {/* Metadata Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 10,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <div><strong>Document #:</strong> <span style={{ fontFamily: 'monospace' }}>{voucher.documentNumber}</span></div>
          <div><strong>Date:</strong> {voucher.date ? dayjs(voucher.date).format('DD-MMM-YYYY') : '—'}</div>
          <div><strong>Status:</strong> <Tag>{voucher.status || 'DRAFT'}</Tag></div>
          {voucher.divisionName && <div><strong>Division:</strong> {voucher.divisionName}</div>}
          {voucher.storeName && <div><strong>Store:</strong> {voucher.storeName}</div>}
          {voucher.destinationStoreName && <div><strong>To Store:</strong> {voucher.destinationStoreName}</div>}
          {voucher.departmentName && <div><strong>Department:</strong> {voucher.departmentName}</div>}
          {voucher.partyName && <div><strong>Party / Vendor:</strong> {voucher.partyName}</div>}
          {voucher.vehicleNumber && <div><strong>Vehicle #:</strong> {voucher.vehicleNumber}</div>}
          {voucher.expectedReturnDate && (
            <div><strong>Expected Return:</strong> {dayjs(voucher.expectedReturnDate).format('DD-MMM-YYYY')}</div>
          )}
        </div>

        {voucher.purpose && (
          <div style={{ marginBottom: 12, fontSize: 13 }}>
            <strong>Purpose / Reference:</strong> {voucher.purpose}
          </div>
        )}

        {/* Line Items */}
        <Table
          size="small"
          bordered
          pagination={false}
          rowKey={(r, i) => String(r.key ?? r.lineNumber ?? i)}
          dataSource={voucher.lines}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: '#', key: 'idx', width: 45, render: (_, r, idx) => r.lineNumber ?? idx + 1 },
            ...(voucher.lines.some((l) => l.itemCode)
              ? [{ title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 120 }]
              : []),
            { title: 'Item / Description', dataIndex: 'itemName', key: 'itemName' },
            { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 80, render: (v) => v || '—' },
            {
              title: 'Qty',
              dataIndex: 'quantity',
              key: 'quantity',
              width: 100,
              align: 'right' as const,
              render: (v) => <strong>{formatDecimal(v || 0)}</strong>,
            },
            ...(voucher.type === 'RGP'
              ? [{
                  title: 'Returned',
                  dataIndex: 'returnedQty',
                  key: 'returnedQty',
                  width: 100,
                  align: 'right' as const,
                  render: (v: number) => formatDecimal(v || 0),
                }]
              : []),
            { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (v) => v || '—' },
          ]}
        />

        {voucher.remarks && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            <strong>Notes:</strong> {voucher.remarks}
          </div>
        )}

        {/* Signature Blocks */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            marginTop: 42,
            paddingTop: 12,
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          {['Prepared By', 'Storekeeper', 'Authorized By', 'Gate Security'].map((label) => (
            <div key={label} style={{ borderTop: `1px solid ${token.colorBorder}`, paddingTop: 6, fontWeight: 600 }}>
              {label}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default StoreVoucherPrintModal;
