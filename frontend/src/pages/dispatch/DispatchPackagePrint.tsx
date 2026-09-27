import React from 'react';
import { QRCodeSVG } from '@rc-component/qrcode';
import { renderToStaticMarkup } from 'react-dom/server';
import { DispatchPackage } from '../../services/dispatchPackageService';
import { Modal, Button, Space, Typography, Table, Tag } from 'antd';
import { PrinterOutlined, QrcodeOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export function generateDispatchPackageHtml(pkg: DispatchPackage): string {
  const qrSvgString = renderToStaticMarkup(
    <QRCodeSVG
      value={pkg.packageQrPayload || pkg.packageNo}
      size={110}
      level="H"
      includeMargin={false}
    />
  );

  const unitsRows = (pkg.units || [])
    .filter((u) => u.status === 'PACKED')
    .map(
      (u, idx) => `
      <tr>
        <td style="text-align: center; border: 1px solid #d1d5db; padding: 4px 6px;">${idx + 1}</td>
        <td style="font-weight: bold; border: 1px solid #d1d5db; padding: 4px 6px;">${u.productionUnit?.coilNo || '-'}</td>
        <td style="font-family: monospace; border: 1px solid #d1d5db; padding: 4px 6px;">${u.productionUnit?.unitSerialNo || '-'}</td>
        <td style="border: 1px solid #d1d5db; padding: 4px 6px;">${u.productionUnit?.item?.name || 'Production Unit'}</td>
        <td style="text-align: right; font-weight: bold; border: 1px solid #d1d5db; padding: 4px 6px;">${Number(u.productionUnit?.weightKg || 0).toFixed(2)} KG</td>
        <td style="text-align: right; border: 1px solid #d1d5db; padding: 4px 6px;">${Number(u.productionUnit?.lengthMeters || 0).toFixed(0)} M</td>
        <td style="text-align: center; border: 1px solid #d1d5db; padding: 4px 6px;">${u.productionUnit?.batchNo || '-'}</td>
      </tr>
    `
    )
    .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Dispatch Package - ${pkg.packageNo}</title>
    <style>
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      body {
        margin: 0;
        padding: 10mm;
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
        font-size: 9.5pt;
        color: #111827;
        background: #ffffff;
      }
      .header-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid #111827;
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .brand-title {
        font-size: 15pt;
        font-weight: 900;
        letter-spacing: 0.04em;
        color: #111827;
        margin: 0 0 2px 0;
      }
      .brand-subtitle {
        font-size: 8.5pt;
        font-weight: 700;
        color: #4b5563;
        text-transform: uppercase;
        margin: 0;
      }
      .doc-badge {
        display: inline-block;
        background: #111827;
        color: #ffffff;
        font-weight: 800;
        font-size: 9pt;
        padding: 4px 10px;
        border-radius: 4px;
        letter-spacing: 0.05em;
        margin-top: 4px;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 12px;
        margin-bottom: 14px;
      }
      .meta-box {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px 12px;
      }
      .meta-row {
        display: flex;
        justify-content: space-between;
        padding: 2.5px 0;
        border-bottom: 1px dashed #e5e7eb;
      }
      .meta-row:last-child {
        border-bottom: none;
      }
      .meta-label {
        font-weight: 600;
        color: #4b5563;
      }
      .meta-val {
        font-weight: 700;
        color: #111827;
      }
      .qr-box {
        background: #ffffff;
        border: 1px solid #111827;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 8px;
        text-align: center;
      }
      .qr-caption {
        font-size: 7.5pt;
        font-weight: bold;
        color: #374151;
        margin-top: 4px;
        letter-spacing: 0.04em;
      }
      .totals-banner {
        display: flex;
        background: #1e293b;
        color: #ffffff;
        border-radius: 6px;
        padding: 8px 14px;
        justify-content: space-around;
        margin-bottom: 14px;
      }
      .total-stat {
        text-align: center;
      }
      .total-stat-label {
        font-size: 7.5pt;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8;
      }
      .total-stat-val {
        font-size: 13pt;
        font-weight: 800;
        color: #38bdf8;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5pt;
        margin-bottom: 24px;
      }
      th {
        background: #f1f5f9;
        color: #0f172a;
        font-weight: 700;
        text-align: left;
        border: 1px solid #cbd5e1;
        padding: 6px 8px;
        text-transform: uppercase;
        font-size: 7.5pt;
      }
      .signature-section {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 20px;
        margin-top: 30px;
        padding-top: 10px;
      }
      .sig-line {
        border-top: 1px solid #4b5563;
        padding-top: 4px;
        text-align: center;
        font-size: 8pt;
        font-weight: 600;
        color: #374151;
      }
    </style>
  </head>
  <body>
    <div class="header-container">
      <div>
        <h1 class="brand-title">PAKISTAN WIRE INDUSTRIES (PVT) LTD</h1>
        <p class="brand-subtitle">Enterprise ERP &amp; MRP System &bull; Dispatch &amp; Package Manifest</p>
        <span class="doc-badge">DISPATCH PACKAGE: ${pkg.packageNo}</span>
      </div>
      <div class="qr-box">
        ${qrSvgString}
        <div class="qr-caption">${pkg.packageNo}</div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="meta-box">
        <div class="meta-row"><span class="meta-label">Customer:</span><span class="meta-val">${pkg.customerName || 'Standard Customer'}</span></div>
        <div class="meta-row"><span class="meta-label">Sales Order:</span><span class="meta-val">${pkg.salesOrderNo || 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Gate Pass / Delivery:</span><span class="meta-val">${pkg.gatePassNo || 'PENDING'}</span></div>
        <div class="meta-row"><span class="meta-label">Warehouse / Location:</span><span class="meta-val">${pkg.warehouseName || pkg.dispatchLocation || 'Central Warehouse'}</span></div>
        <div class="meta-row"><span class="meta-label">Vehicle &amp; Driver:</span><span class="meta-val">${pkg.vehicleNo || 'N/A'}${pkg.driverName ? ` (${pkg.driverName})` : ''}</span></div>
      </div>

      <div class="meta-box">
        <div class="meta-row"><span class="meta-label">Package Date:</span><span class="meta-val">${new Date(pkg.packageDate || pkg.createdAt).toLocaleDateString()}</span></div>
        <div class="meta-row"><span class="meta-label">Package Status:</span><span class="meta-val" style="color: #059669; font-weight: 900;">${pkg.status}</span></div>
        <div class="meta-row"><span class="meta-label">Finalized At:</span><span class="meta-val">${pkg.finalizedAt ? new Date(pkg.finalizedAt).toLocaleDateString() : 'In Progress'}</span></div>
        <div class="meta-row"><span class="meta-label">Print Count:</span><span class="meta-val">${(pkg.printCount || 0) + 1}</span></div>
      </div>
    </div>

    <div class="totals-banner">
      <div class="total-stat">
        <div class="total-stat-label">Total Units</div>
        <div class="total-stat-val">${pkg.totalUnits || (pkg.units || []).filter(u => u.status === 'PACKED').length}</div>
      </div>
      <div class="total-stat">
        <div class="total-stat-label">Total Weight</div>
        <div class="total-stat-val">${Number(pkg.totalWeight || 0).toFixed(2)} KG</div>
      </div>
      <div class="total-stat">
        <div class="total-stat-label">Total Length</div>
        <div class="total-stat-val">${Number(pkg.totalLength || 0).toLocaleString()} M</div>
      </div>
    </div>

    <table aria-label="Scanned production units">
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">#</th>
          <th style="width: 90px;">Coil No</th>
          <th style="width: 150px;">Serial No</th>
          <th>Item Description</th>
          <th style="width: 90px; text-align: right;">Weight</th>
          <th style="width: 80px; text-align: right;">Length</th>
          <th style="width: 60px; text-align: center;">Batch</th>
        </tr>
      </thead>
      <tbody>
        ${unitsRows || '<tr><td colspan="7" style="text-align: center; padding: 12px; color: #6b7280;">No production units scanned in this package</td></tr>'}
      </tbody>
    </table>

    <div class="signature-section">
      <div class="sig-line">Prepared / Packed By (Operator)</div>
      <div class="sig-line">Verified By (Warehouse Supervisor)</div>
      <div class="sig-line">Authorized Gate Exit (Security Officer)</div>
    </div>
  </body>
</html>`;
}

export function printDispatchPackageDirectly(pkg: DispatchPackage): void {
  const htmlContent = generateDispatchPackageHtml(pkg);
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
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1500);
  }, 350);
}

interface DispatchPackagePrintModalProps {
  open: boolean;
  onClose: () => void;
  pkg: DispatchPackage | null;
  onPrintRecorded?: () => void;
}

export const DispatchPackagePrintModal: React.FC<DispatchPackagePrintModalProps> = ({
  open,
  onClose,
  pkg,
  onPrintRecorded,
}) => {
  if (!pkg) return null;

  const handlePrint = () => {
    printDispatchPackageDirectly(pkg);
    if (onPrintRecorded) onPrintRecorded();
  };

  const columns = [
    { title: '#', dataIndex: 'idx', key: 'idx', width: 45, render: (_: any, __: any, i: number) => i + 1 },
    {
      title: 'Coil No',
      key: 'coilNo',
      render: (_: any, r: any) => <strong style={{ color: '#0284c7' }}>{r.productionUnit?.coilNo}</strong>,
    },
    {
      title: 'Serial No',
      key: 'unitSerialNo',
      render: (_: any, r: any) => <span style={{ fontFamily: 'monospace' }}>{r.productionUnit?.unitSerialNo}</span>,
    },
    {
      title: 'Item',
      key: 'item',
      render: (_: any, r: any) => r.productionUnit?.item?.name || 'Item',
    },
    {
      title: 'Weight',
      key: 'weightKg',
      align: 'right' as const,
      render: (_: any, r: any) => <strong>{Number(r.productionUnit?.weightKg || 0).toFixed(2)} KG</strong>,
    },
    {
      title: 'Length',
      key: 'lengthMeters',
      align: 'right' as const,
      render: (_: any, r: any) => `${Number(r.productionUnit?.lengthMeters || 0).toFixed(0)} M`,
    },
  ];

  const activeUnits = (pkg.units || []).filter((u) => u.status === 'PACKED');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={780}
      title={
        <Space>
          <PrinterOutlined style={{ color: 'var(--theme-primary, #0284c7)' }} />
          <span>Dispatch Package Document &bull; {pkg.packageNo}</span>
        </Space>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          Close Preview
        </Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
          Print Package Document / Label
        </Button>,
      ]}
    >
      <div style={{ padding: '12px 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--theme-surface-alt, #f8fafc)',
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
            border: '1px solid var(--theme-border, #e2e8f0)',
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0, color: 'var(--theme-heading, #0f172a)' }}>
              {pkg.packageNo}
            </Title>
            <Text type="secondary">
              Customer: {pkg.customerName || 'N/A'} &bull; SO: {pkg.salesOrderNo || 'N/A'}
            </Text>
            <div style={{ marginTop: 6 }}>
              <Tag color={pkg.status === 'FINALIZED' ? 'green' : 'blue'}>{pkg.status}</Tag>
              {pkg.gatePassNo && <Tag color="purple">Gate Pass: {pkg.gatePassNo}</Tag>}
            </div>
          </div>
          <div style={{ textAlign: 'center', background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <QRCodeSVG value={pkg.packageQrPayload || pkg.packageNo} size={80} level="H" />
            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>PACKAGE QR</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>TOTAL UNITS</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>{pkg.totalUnits}</div>
          </div>
          <div style={{ background: '#f0f9ff', border: '1px solid #7dd3fc', padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#075985', fontWeight: 600 }}>TOTAL WEIGHT</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0284c7' }}>{Number(pkg.totalWeight || 0).toFixed(2)} KG</div>
          </div>
          <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b21a8', fontWeight: 600 }}>TOTAL LENGTH</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#9333ea' }}>{Number(pkg.totalLength || 0).toLocaleString()} M</div>
          </div>
        </div>

        <Table
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={activeUnits}
          pagination={false}
          scroll={{ y: 280 }}
        />
      </div>
    </Modal>
  );
};
