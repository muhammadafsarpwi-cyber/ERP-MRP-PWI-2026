import React, { useState, useMemo } from 'react';
import { Modal, Button, Space, Tag, Segmented, theme, App } from 'antd';
import {
  PrinterOutlined,
  WhatsAppOutlined,
  CopyOutlined,
  FilePdfOutlined,
  AppstoreOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { QmsInProcessInspection } from './types';
import { exportQmsToPdf, exportBatchQmsToPdf } from './exportQmsPdf';
import {
  buildQmsWhatsAppMessage,
  shareQmsOnWhatsApp,
  buildBatchQmsWhatsAppMessage,
  shareBatchQmsOnWhatsApp,
} from './exportQmsWhatsApp';

interface QmsPrintableSheetProps {
  visible: boolean;
  onClose: () => void;
  inspection: QmsInProcessInspection | null;
  batchInspections?: QmsInProcessInspection[];
}

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

const SingleInspectionContent: React.FC<{
  inspection: QmsInProcessInspection;
  token: any;
}> = ({ inspection, token }) => {
  return (
    <div className="qms-single-sheet" style={{ padding: '8px' }}>
      {/* QMS Official Document Header - Clean ink-friendly with vibrant primary dividing line */}
      <div
        style={{
          borderBottom: `2px solid ${token.colorPrimary}`,
          paddingBottom: '12px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src="/logo.png"
            alt="PWI Logo"
            style={{
              width: '48px',
              height: '48px',
              objectFit: 'contain',
            }}
          />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: token.colorTextHeading, letterSpacing: '0.4px' }}>
              PAKISTAN WIRE INDUSTRIES (PVT.) LTD.
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: token.colorPrimary, marginTop: '2px' }}>
              IN-PROCESS QUALITY INSPECTION REPORT (QMS) — {inspection.divisionName.toUpperCase()}
            </div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, marginTop: '1px' }}>
              Factory &amp; Quality Management System • Department: {inspection.departmentName}
            </div>
          </div>
        </div>
        <div
          style={{
            textAlign: 'right',
            padding: '6px 12px',
            borderRadius: '6px',
            backgroundColor: token.colorFillAlter,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: token.colorText }}>
            Doc Ref: <span style={{ color: token.colorPrimary }}>{inspection.docRef}</span>
          </div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
            Revision No: <strong>{inspection.revNo}</strong>
          </div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
            Issue Date: <strong>{inspection.issueDate}</strong>
          </div>
        </div>
      </div>

      {/* Metadata Header Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          padding: '12px',
          backgroundColor: token.colorFillAlter,
          borderRadius: '6px',
          marginBottom: '16px',
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Date:</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{inspection.inspectionDate}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Shift:</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>Shift {inspection.shift}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Machine No:</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{inspection.machineNo}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Operator:</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{inspection.operatorName}</div>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Part / Item Name:</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorPrimary }}>
            {inspection.itemName} <span style={{ fontSize: '11px', color: token.colorTextSecondary }}>({inspection.itemCode})</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Prepared By (Inspector):</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: token.colorText }}>{inspection.inspectorName}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Overall Result:</div>
          <div style={{ marginTop: '2px' }}>
            {renderSolidBadge(inspection.overallResult)}
          </div>
        </div>
      </div>

      {/* 5-Sample Dimensional Checks Table */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: token.colorTextHeading }}>
          DIMENSIONAL INSPECTION DATA (5 SAMPLES PER SHIFT)
        </div>
        <table
          className="qms-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            border: `1px solid ${token.colorBorder}`,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: token.colorFillAlter, textAlign: 'left' }}>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}` }}>#</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}` }}>Characteristic</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}` }}>Dimension Requirement (Nominal &amp; Tol)</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-1</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-2</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-3</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-4</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-5</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Average</th>
              <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {inspection.samples.map((s, idx) => (
              <tr key={s.id || idx}>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{idx + 1}</td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, fontWeight: 600 }}>{s.charName}</td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}` }}>
                  {s.nominal} (±{s.tolPlus}{s.unit})
                </td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s1 ?? '-'}</td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s2 ?? '-'}</td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s3 ?? '-'}</td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s4 ?? '-'}</td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>{s.s5 ?? '-'}</td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', fontWeight: 700 }}>
                  {s.average ? `${s.average} ${s.unit}` : '-'}
                </td>
                <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>
                  {renderSolidBadge(s.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visual / Go-NoGo Attributes */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: token.colorTextHeading }}>
          VISUAL / FUNCTIONAL ATTRIBUTE CHECKS (GO / NO-GO)
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {inspection.attributes.map((a, idx) => (
            <div
              key={a.id || idx}
              style={{
                flex: '1 1 200px',
                padding: '10px',
                borderRadius: '6px',
                border: `1px solid ${token.colorBorderSecondary}`,
                backgroundColor: token.colorFillAlter,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: token.colorText }}>{a.checkName}</div>
                <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
                  Checked: {a.checkedQty} | Defects: {a.defectsQty}
                </div>
              </div>
              {renderSolidBadge(a.status)}
            </div>
          ))}
        </div>
      </div>

      {/* Signatures & Remarks Footer */}
      <div
        style={{
          marginTop: '24px',
          borderTop: `2px solid ${token.colorBorder}`,
          paddingTop: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ width: '45%' }}>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Remarks / Inspector Notes:</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: token.colorText, marginTop: '4px' }}>
            {inspection.remarks || 'Ok - All inspection parameters meet quality specification standards.'}
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '25%' }}>
          <div style={{ borderBottom: `1px solid ${token.colorBorder}`, height: '32px' }} />
          <div style={{ fontSize: '12px', fontWeight: 700, color: token.colorText, marginTop: '4px' }}>
            {inspection.inspectorName || 'Mairaj'}
          </div>
          <div style={{ fontSize: '10px', color: token.colorTextSecondary }}>QC Inspector (Prepared By)</div>
        </div>
        <div style={{ textAlign: 'center', width: '25%' }}>
          <div style={{ borderBottom: `1px solid ${token.colorBorder}`, height: '32px' }} />
          <div style={{ fontSize: '12px', fontWeight: 700, color: token.colorText, marginTop: '4px' }}>
            {inspection.approvedBy || 'Quality Control Incharge'}
          </div>
          <div style={{ fontSize: '10px', color: token.colorTextSecondary }}>Approved / Verified By</div>
        </div>
      </div>
    </div>
  );
};

export const QmsPrintableSheet: React.FC<QmsPrintableSheetProps> = ({
  visible,
  onClose,
  inspection,
  batchInspections = [],
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  const isMultiBatch = batchInspections && batchInspections.length > 1;
  const [selectedView, setSelectedView] = useState<string>('ALL');

  // Determine active single inspection if one is selected
  const activeSingleInspection = useMemo(() => {
    if (!isMultiBatch) return inspection;
    if (selectedView === 'ALL') return batchInspections[0] || inspection;
    return batchInspections.find((b) => b.id === selectedView) || batchInspections[0] || inspection;
  }, [isMultiBatch, selectedView, batchInspections, inspection]);

  const segmentedOptions = useMemo(() => {
    if (!isMultiBatch) return [];
    return [
      {
        label: `All Selected (${batchInspections.length})`,
        value: 'ALL',
        icon: <AppstoreOutlined />,
      },
      ...batchInspections.map((b, idx) => ({
        label: `#${idx + 1} ${b.inspectionNo}`,
        value: b.id,
        icon: <FileTextOutlined />,
      })),
    ];
  }, [isMultiBatch, batchInspections]);

  const handleDownloadPdf = () => {
    try {
      if (isMultiBatch && selectedView === 'ALL') {
        const filename = exportBatchQmsToPdf(batchInspections);
        message.success(`Official QMS Batch PDF generated with ${batchInspections.length} records: ${filename}`);
      } else {
        const target = activeSingleInspection || inspection;
        if (target) {
          const filename = exportQmsToPdf(target);
          message.success(`Official QMS PDF generated: ${filename}`);
        }
      }
    } catch (err) {
      message.error('Failed to generate PDF. Please try again.');
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById('qms-printable-area');
    if (!printContent) return;

    const title = isMultiBatch && selectedView === 'ALL'
      ? `QMS-Batch-Inspections-${batchInspections.length}-Records`
      : `${activeSingleInspection?.docRef || 'QMS'} - ${activeSingleInspection?.inspectionNo || 'Sheet'}`;

    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (!printWindow) {
      handleDownloadPdf();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #000000; background: #ffffff; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th, td { border: 1px solid #000000; padding: 6px 8px; }
            th { background-color: #f1f5f9; text-align: left; }
            .no-print { display: none !important; }
            .qms-sheet-separator { page-break-after: always; break-after: page; margin-bottom: 30px; }
            @media print {
              @page { size: A4 portrait; margin: 12mm; }
              body { margin: 0; }
              .qms-sheet-separator { page-break-after: always; break-after: page; border: none !important; margin: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  const handleCopyWhatsApp = () => {
    if (isMultiBatch && selectedView === 'ALL') {
      const text = buildBatchQmsWhatsAppMessage(batchInspections);
      navigator.clipboard.writeText(text);
      message.success(`QMS Batch Summary (${batchInspections.length} records) copied to clipboard!`);
    } else {
      const target = activeSingleInspection || inspection;
      if (target) {
        const text = buildQmsWhatsAppMessage(target);
        navigator.clipboard.writeText(text);
        message.success('QMS Report formatted for WhatsApp copied to clipboard!');
      }
    }
  };

  const handleOpenWhatsApp = () => {
    if (isMultiBatch && selectedView === 'ALL') {
      shareBatchQmsOnWhatsApp(batchInspections);
    } else {
      const target = activeSingleInspection || inspection;
      if (target) {
        shareQmsOnWhatsApp(target);
      }
    }
  };

  const hasData = Boolean(inspection) || (batchInspections && batchInspections.length > 0);
  if (!hasData) return null;

  return (
    <Modal
      title={
        isMultiBatch ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '28px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700 }}>
                Batch Inspection Sheets Preview
              </span>
              <Tag color="blue" style={{ fontWeight: 700 }}>
                {batchInspections.length} Selected
              </Tag>
            </div>
            <Segmented
              size="small"
              options={segmentedOptions}
              value={selectedView}
              onChange={(val) => setSelectedView(val as string)}
            />
          </div>
        ) : null
      }
      open={visible}
      onCancel={onClose}
      width={880}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button key="wa-copy" icon={<CopyOutlined />} onClick={handleCopyWhatsApp}>
          {isMultiBatch && selectedView === 'ALL' ? 'Copy Batch WhatsApp' : 'Copy WhatsApp'}
        </Button>,
        <Button
          key="wa"
          type="default"
          style={{ color: '#25D366', borderColor: '#25D366' }}
          icon={<WhatsAppOutlined />}
          onClick={handleOpenWhatsApp}
        >
          {isMultiBatch && selectedView === 'ALL' ? `WhatsApp Batch (${batchInspections.length})` : 'WhatsApp Share'}
        </Button>,
        <Button key="pdf" danger type="primary" icon={<FilePdfOutlined />} onClick={handleDownloadPdf}>
          {isMultiBatch && selectedView === 'ALL' ? `Download Combined PDF (${batchInspections.length})` : 'Download PDF'}
        </Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
          {isMultiBatch && selectedView === 'ALL' ? `Print All Selected (${batchInspections.length})` : 'Print QMS Sheet'}
        </Button>,
      ]}
    >
      <div id="qms-printable-area">
        {isMultiBatch && selectedView === 'ALL' ? (
          batchInspections.map((insp, idx) => (
            <div key={insp.id}>
              <SingleInspectionContent inspection={insp} token={token} />
              {idx < batchInspections.length - 1 && (
                <div
                  className="qms-sheet-separator"
                  style={{
                    borderBottom: '2px dashed #cbd5e1',
                    margin: '28px 0',
                    textAlign: 'center',
                  }}
                >
                  <span
                    className="no-print"
                    style={{
                      fontSize: '11px',
                      color: token.colorTextSecondary,
                      backgroundColor: token.colorFillAlter,
                      padding: '2px 10px',
                      borderRadius: '10px',
                    }}
                  >
                    Page Break (Sheet #{idx + 2} Next)
                  </span>
                </div>
              )}
            </div>
          ))
        ) : (
          <SingleInspectionContent
            inspection={activeSingleInspection || inspection!}
            token={token}
          />
        )}
      </div>
    </Modal>
  );
};
