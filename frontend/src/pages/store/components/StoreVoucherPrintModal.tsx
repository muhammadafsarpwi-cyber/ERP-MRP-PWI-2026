import React from 'react';
import { Modal, Button, Table, Tag, Space, Typography, theme } from 'antd';
import { PrinterOutlined, FilePdfOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDecimal } from '../../../utils/numberFormat';
import { getLogoUrl } from '../../../utils/printTemplates';
import '../storeResponsive.css';

const { Text } = Typography;

export type StoreVoucherType = 'GRN' | 'MIR' | 'MIV' | 'MTN' | 'RGP' | 'NRGP';

export interface StoreVoucherLine {
  key?: string | number;
  lineNumber?: number;
  itemCode?: string;
  itemName: string;
  uomCode?: string;
  quantity: number;
  returnedQty?: number;
  lastIssuedInfo?: string;
  remainingStock?: number;
  remainingStockUom?: string;
  purpose?: string;
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
  sectionName?: string;
  departmentName?: string;
  machineName?: string;
  operatorName?: string;
  shiftInchargeName?: string;
  issuedByName?: string;
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
  MIR: 'STORE ISSUE NOTE (SIN)',
  MIV: 'STORE ISSUE NOTE (SIN)',
  MTN: 'MATERIAL TRANSFER NOTE (MTN)',
  RGP: 'RETURNABLE GATE PASS (RGP)',
  NRGP: 'NON-RETURNABLE GATE PASS (NRGP)',
};

const escapeHtml = (str?: string | number | null) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function printStoreVoucherHtml(voucher: StoreVoucherData): void {
  const isIssueVoucher = voucher.type === 'MIR' || voucher.type === 'MIV';
  const titleText = VOUCHER_TITLES[voucher.type] || 'STORE ISSUE NOTE (SIN)';
  const formattedDate = voucher.date ? dayjs(voucher.date).format('DD-MMM-YYYY') : '—';

  const printWin = window.open('', '_blank', 'width=960,height=760');
  if (!printWin) {
    window.print();
    return;
  }

  const rowsHtml = voucher.lines
    .map(
      (l, idx) => `
      <tr>
        <td style="text-align:center;">${l.lineNumber ?? idx + 1}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(l.itemCode || '—')}</td>
        <td>${escapeHtml(l.itemName || '—')}</td>
        <td style="text-align:center;">${escapeHtml(l.uomCode || '—')}</td>
        <td style="text-align:right;font-weight:700;">${formatDecimal(l.quantity || 0)}</td>
        ${
          isIssueVoucher || voucher.type === 'RGP'
            ? `<td style="text-align:right;">${formatDecimal(l.returnedQty || 0)}</td>`
            : ''
        }
        ${
          isIssueVoucher
            ? `<td style="text-align:right;white-space:nowrap;">${
                l.remainingStock !== undefined && l.remainingStock !== null
                  ? `${formatDecimal(l.remainingStock)} ${escapeHtml(l.remainingStockUom || l.uomCode || '')}`
                  : '—'
              }</td>
               <td style="font-size:10.5px;">${escapeHtml(l.lastIssuedInfo || '—')}</td>`
            : ''
        }
        <td>${escapeHtml(l.remarks || voucher.purpose || '—')}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titleText)} - ${escapeHtml(voucher.documentNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 14px; font-size: 12px; }
    .hdr { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; gap: 12px; }
    .hdr-left { display: flex; align-items: center; gap: 12px; }
    .hdr-logo { height: 48px; width: auto; object-fit: contain; }
    .co { font-size: 18px; font-weight: 800; letter-spacing: 0.4px; }
    .addr { font-size: 11px; color: #475569; margin-top: 2px; }
    .badge-box { text-align: right; }
    .sub { font-size: 13px; font-weight: 800; color: #0f172a; border: 1.5px solid #0f172a; padding: 4px 10px; border-radius: 4px; display: inline-block; }
    .sin-no { font-family: monospace; font-size: 13px; font-weight: 800; margin-top: 4px; color: #c2410c; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 14px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; background: #f8fafc; }
    .meta div { line-height: 1.4; }
    .lbl { font-weight: 700; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #94a3b8; padding: 7px 8px; font-size: 11.5px; vertical-align: top; }
    th { background: #e2e8f0; font-weight: 700; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.3px; }
    .notes { margin-top: 12px; padding: 8px 10px; border: 1px dashed #94a3b8; border-radius: 4px; font-size: 11.5px; }
    .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 52px; text-align: center; }
    .sig-box { border-top: 1.5px solid #0f172a; padding-top: 6px; }
    .sig-title { font-weight: 700; font-size: 12px; }
    .sig-name { font-size: 11px; color: #475569; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <img class="hdr-logo" src="${getLogoUrl()}" alt="PWI Logo" onerror="this.style.display='none'" />
      <div>
        <div class="co">PAKISTAN WIRE INDUSTRIES (PVT.) LTD.</div>
        <div class="addr">Plot 179, Block E, SITE Superhighway, Karachi, Pakistan</div>
      </div>
    </div>
    <div class="badge-box">
      <div class="sub">${escapeHtml(titleText)}</div>
      <div class="sin-no">${escapeHtml(voucher.documentNumber)}</div>
    </div>
  </div>
  <div class="meta">
    <div><span class="lbl">Voucher #:</span> <strong>${escapeHtml(voucher.documentNumber)}</strong></div>
    <div><span class="lbl">Issue Date:</span> ${escapeHtml(formattedDate)}</div>
    <div><span class="lbl">Status:</span> ${escapeHtml(voucher.status || 'DRAFT')}</div>
    <div><span class="lbl">Division:</span> ${escapeHtml(voucher.divisionName || '—')}</div>
    <div><span class="lbl">Source Store:</span> ${escapeHtml(voucher.storeName || '—')}</div>
    <div><span class="lbl">Destination Section:</span> ${escapeHtml(voucher.sectionName || '—')}</div>
    <div><span class="lbl">Department:</span> ${escapeHtml(voucher.departmentName || '—')}</div>
    <div><span class="lbl">Machine:</span> ${escapeHtml(voucher.machineName || 'General Allocation')}</div>
    <div><span class="lbl">Operator Name:</span> ${escapeHtml(voucher.operatorName || '—')}</div>
    <div><span class="lbl">Shift Incharge:</span> ${escapeHtml(voucher.shiftInchargeName || '—')}</div>
    <div><span class="lbl">Store Incharge:</span> ${escapeHtml(voucher.issuedByName || '—')}</div>
    <div><span class="lbl">Part Use / Purpose:</span> ${escapeHtml(voucher.purpose || '—')}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:32px;">#</th>
        <th style="width:95px;">Item Code</th>
        <th>Item Description</th>
        <th style="width:50px;">UOM</th>
        <th style="width:68px;">Issued Qty</th>
        ${isIssueVoucher || voucher.type === 'RGP' ? '<th style="width:80px;">Old Returned Scrap</th>' : ''}
        ${isIssueVoucher ? '<th style="width:85px;">Remaining Store Stock</th><th>Last Issued Info</th>' : ''}
        <th>Part Use / Purpose</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  ${voucher.remarks ? `<div class="notes"><strong>Remarks:</strong> ${escapeHtml(voucher.remarks)}</div>` : ''}
  <div class="sigs">
    <div class="sig-box">
      <div class="sig-title">Issued By (Store Incharge)</div>
      <div class="sig-name">${escapeHtml(voucher.issuedByName || '________________')}</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Received By (Operator)</div>
      <div class="sig-name">${escapeHtml(voucher.operatorName || '________________')}</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Verified By (Shift Incharge)</div>
      <div class="sig-name">${escapeHtml(voucher.shiftInchargeName || '________________')}</div>
    </div>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 180);
    };
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

export function downloadStoreVoucherPdf(voucher: StoreVoucherData): void {
  const isIssueVoucher = voucher.type === 'MIR' || voucher.type === 'MIV';
  const titleText = VOUCHER_TITLES[voucher.type] || 'STORE ISSUE NOTE (SIN)';
  const formattedDate = voucher.date ? dayjs(voucher.date).format('DD-MMM-YYYY') : '—';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD.', pageWidth / 2, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.text('Plot 179, Block E, SITE Superhighway, Karachi, Pakistan', pageWidth / 2, 19, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(titleText, pageWidth / 2, 24.5, { align: 'center' });

  doc.setLineWidth(0.4);
  doc.line(14, 27, pageWidth - 14, 27);

  doc.setFontSize(9.5);
  const metaRows: Array<[string, string, string, string]> = [
    ['Voucher #:', voucher.documentNumber || '—', 'Issue Date:', formattedDate],
    ['Division:', voucher.divisionName || '—', 'Source Store:', voucher.storeName || '—'],
    ['Section:', voucher.sectionName || '—', 'Department:', voucher.departmentName || '—'],
    ['Machine:', voucher.machineName || 'General Allocation', 'Status:', voucher.status || 'DRAFT'],
    ['Operator:', voucher.operatorName || '—', 'Shift Incharge:', voucher.shiftInchargeName || '—'],
    ['Store Incharge:', voucher.issuedByName || '—', 'Part Use:', voucher.purpose || '—'],
  ];

  let y = 32.5;
  metaRows.forEach(([k1, v1, k2, v2]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(k1, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v1).slice(0, 38), 42, y);

    doc.setFont('helvetica', 'bold');
    doc.text(k2, 112, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v2).slice(0, 38), 142, y);
    y += 5.5;
  });

  if (voucher.remarks) {
    doc.setFont('helvetica', 'bold');
    doc.text('Remarks:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(voucher.remarks).slice(0, 95), 42, y);
    y += 5.5;
  }

  autoTable(doc, {
    startY: y + 2,
    head: [
      isIssueVoucher
        ? [
            '#',
            'Item Code',
            'Item Description',
            'UOM',
            'Issued Qty',
            'Old Returned Scrap',
            'Remaining Stock',
            'Last Issued Info',
            'Part Use / Purpose',
          ]
        : [
            '#',
            'Item Code',
            'Item Description',
            'UOM',
            'Issued Qty',
            'Old Returned Scrap',
            'Part Use / Service Life Note',
          ],
    ],
    body: voucher.lines.map((l, idx) =>
      isIssueVoucher
        ? [
            String(l.lineNumber ?? idx + 1),
            l.itemCode || '—',
            l.itemName || '—',
            l.uomCode || '—',
            formatDecimal(l.quantity || 0),
            formatDecimal(l.returnedQty || 0),
            l.remainingStock !== undefined && l.remainingStock !== null
              ? `${formatDecimal(l.remainingStock)} ${l.remainingStockUom || l.uomCode || ''}`.trim()
              : '—',
            l.lastIssuedInfo || '—',
            l.remarks || voucher.purpose || '—',
          ]
        : [
            String(l.lineNumber ?? idx + 1),
            l.itemCode || '—',
            l.itemName || '—',
            l.uomCode || '—',
            formatDecimal(l.quantity || 0),
            formatDecimal(l.returnedQty || 0),
            l.remarks || voucher.purpose || '—',
          ],
    ),
    styles: { fontSize: isIssueVoucher ? 7.8 : 8.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    columnStyles: isIssueVoucher
      ? {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 20, fontStyle: 'bold' },
          2: { cellWidth: 34 },
          3: { cellWidth: 11, halign: 'center' },
          4: { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 15, halign: 'right' },
          6: { cellWidth: 17, halign: 'right' },
          7: { cellWidth: 35 },
        }
      : {
          0: { cellWidth: 9, halign: 'center' },
          1: { cellWidth: 26, fontStyle: 'bold' },
          2: { cellWidth: 50 },
          3: { cellWidth: 14, halign: 'center' },
          4: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 22, halign: 'right' },
        },
  });

  const finalY = Math.min((doc as any).lastAutoTable?.finalY || y + 40, 245);
  const sigY = finalY + 26;

  const sigCols = [
    { x: 14, w: 52, title: 'Issued By (Store Incharge)', sub: voucher.issuedByName || '' },
    { x: 79, w: 52, title: 'Received By (Operator)', sub: voucher.operatorName || '' },
    { x: 144, w: 52, title: 'Verified By (Shift Incharge)', sub: voucher.shiftInchargeName || '' },
  ];

  sigCols.forEach((s) => {
    doc.line(s.x, sigY, s.x + s.w, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(s.title, s.x + s.w / 2, sigY + 5, { align: 'center' });
    if (s.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(s.sub, s.x + s.w / 2, sigY + 9.5, { align: 'center' });
    }
  });

  doc.save(`${isIssueVoucher ? 'SIN' : voucher.type}_${voucher.documentNumber || 'Voucher'}.pdf`);
}

export const StoreVoucherPrintModal: React.FC<StoreVoucherPrintModalProps> = ({
  open,
  onClose,
  voucher,
}) => {
  const { token } = theme.useToken();

  if (!voucher) return null;

  const isIssueVoucher = voucher.type === 'MIR' || voucher.type === 'MIV';
  const titleText = VOUCHER_TITLES[voucher.type] || 'STORE ISSUE NOTE (SIN)';
  const formattedDate = voucher.date ? dayjs(voucher.date).format('DD-MMM-YYYY') : '—';

  const handlePrint = () => printStoreVoucherHtml(voucher);
  const handleDownloadPdf = () => downloadStoreVoucherPdf(voucher);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={940}
      closable={false}
      footer={null}
      styles={{
        content: {
          padding: 7,
          borderRadius: 20,
          background: token.colorFillSecondary,
          border: `1px solid ${token.colorBorder}`,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
        },
        body: { padding: 0 },
      }}
    >
      <div
        style={{
          borderRadius: 14,
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'hidden',
        }}
      >
        {/* Top Action Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            background: token.colorFillAlter,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Text strong style={{ fontSize: 15 }}>
            {titleText} — {voucher.documentNumber}
          </Text>
          <Space size={8}>
            <Button icon={<FilePdfOutlined />} onClick={handleDownloadPdf}>
              Download PDF
            </Button>
            <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
              Print Voucher (A4)
            </Button>
            <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
          </Space>
        </div>

        {/* Printable A4 Sheet Preview */}
        <div style={{ padding: 20, maxHeight: '78vh', overflowY: 'auto' }}>
          <div
            className="store-print-voucher-sheet"
            style={{
              padding: 20,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 10,
              background: token.colorBgContainer,
              color: token.colorText,
            }}
          >
            {/* Company Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `2px solid ${token.colorBorder}`,
                paddingBottom: 12,
                marginBottom: 16,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={getLogoUrl()}
                  alt="PWI Logo"
                  style={{ height: 44, width: 'auto', objectFit: 'contain' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.4 }}>
                    PAKISTAN WIRE INDUSTRIES (PVT.) LTD.
                  </div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    Plot 179, Block E, SITE Superhighway, Karachi, Pakistan
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Tag color="orange" style={{ margin: 0, fontWeight: 700, fontSize: 12.5, padding: '2px 10px' }}>
                  {titleText}
                </Tag>
              </div>
            </div>

            {/* Metadata Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '8px 16px',
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                fontSize: 12.5,
              }}
            >
              <div><strong>Voucher #:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{voucher.documentNumber}</span></div>
              <div><strong>Issue Date:</strong> {formattedDate}</div>
              <div><strong>Status:</strong> <Tag color={voucher.status === 'POSTED' ? 'success' : 'processing'}>{voucher.status || 'DRAFT'}</Tag></div>
              <div><strong>Division:</strong> {voucher.divisionName || '—'}</div>
              <div><strong>Source Store:</strong> {voucher.storeName || '—'}</div>
              <div><strong>Destination Section:</strong> {voucher.sectionName || '—'}</div>
              <div><strong>Department:</strong> {voucher.departmentName || '—'}</div>
              <div><strong>Machine:</strong> {voucher.machineName || 'General Allocation'}</div>
              <div><strong>Operator Name:</strong> {voucher.operatorName || '—'}</div>
              <div><strong>Shift Incharge:</strong> {voucher.shiftInchargeName || '—'}</div>
              <div><strong>Store Incharge:</strong> {voucher.issuedByName || '—'}</div>
              {voucher.purpose && <div style={{ gridColumn: '1 / -1' }}><strong>Part Use / Purpose:</strong> {voucher.purpose}</div>}
            </div>

            {/* Line Items Table */}
            <Table
              size="small"
              bordered
              pagination={false}
              rowKey={(r, i) => String(r.key ?? r.lineNumber ?? i)}
              dataSource={voucher.lines}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '#', key: 'idx', width: 45, align: 'center', render: (_, r, idx) => r.lineNumber ?? idx + 1 },
                { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 130, render: (v) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v || '—'}</span> },
                { title: 'Item Description', dataIndex: 'itemName', key: 'itemName' },
                { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, align: 'center', render: (v) => v || '—' },
                {
                  title: 'Issued Qty',
                  dataIndex: 'quantity',
                  key: 'quantity',
                  width: 95,
                  align: 'right' as const,
                  render: (v) => <strong>{formatDecimal(v || 0)}</strong>,
                },
                {
                  title: 'Old Returned Scrap',
                  dataIndex: 'returnedQty',
                  key: 'returnedQty',
                  width: 120,
                  align: 'right' as const,
                  render: (v: number) => formatDecimal(v || 0),
                },
                ...(isIssueVoucher
                  ? [
                      {
                        title: 'Remaining Store Stock',
                        key: 'remainingStock',
                        width: 135,
                        align: 'right' as const,
                        render: (_: unknown, r: StoreVoucherLine) =>
                          r.remainingStock !== undefined && r.remainingStock !== null
                            ? `${formatDecimal(r.remainingStock)} ${r.remainingStockUom || r.uomCode || ''}`.trim()
                            : '—',
                      },
                      {
                        title: 'Last Issued Info',
                        dataIndex: 'lastIssuedInfo',
                        key: 'lastIssuedInfo',
                        width: 220,
                        render: (v?: string) => (
                          <span style={{ fontSize: 11.5 }}>{v || '—'}</span>
                        ),
                      },
                    ]
                  : []),
                { title: 'Part Use / Purpose', dataIndex: 'remarks', key: 'remarks', render: (v) => v || voucher.purpose || '—' },
              ]}
            />

            {voucher.remarks && (
              <div style={{ marginTop: 12, fontSize: 12 }}>
                <strong>Remarks:</strong> {voucher.remarks}
              </div>
            )}

            {/* 3 Formal Signature Blocks */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 28,
                marginTop: 44,
                paddingTop: 12,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {[
                { label: 'Issued By (Store Incharge)', name: voucher.issuedByName },
                { label: 'Received By (Operator)', name: voucher.operatorName },
                { label: 'Verified By (Shift Incharge)', name: voucher.shiftInchargeName },
              ].map((sig) => (
                <div key={sig.label} style={{ borderTop: `1.5px solid ${token.colorBorder}`, paddingTop: 6 }}>
                  <div style={{ fontWeight: 700 }}>{sig.label}</div>
                  <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>
                    {sig.name || '________________'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default StoreVoucherPrintModal;
