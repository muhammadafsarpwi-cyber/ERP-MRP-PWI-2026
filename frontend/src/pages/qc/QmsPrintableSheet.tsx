import React from 'react';
import { Modal, Button, Space, Tag, theme, App } from 'antd';
import { PrinterOutlined, WhatsAppOutlined, CopyOutlined } from '@ant-design/icons';
import { QmsInProcessInspection } from './types';

interface QmsPrintableSheetProps {
  visible: boolean;
  onClose: () => void;
  inspection: QmsInProcessInspection | null;
}

export const QmsPrintableSheet: React.FC<QmsPrintableSheetProps> = ({ visible, onClose, inspection }) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  if (!inspection) return null;

  const handlePrint = () => {
    window.print();
  };

  const buildWhatsAppText = () => {
    const lines: string[] = [];
    lines.push('🏭 *PAKISTAN WIRE INDUSTRIES (PVT.) LTD*');
    lines.push('📋 *IN-PROCESS QUALITY INSPECTION REPORT (QMS)*');
    lines.push(`📄 *Doc Ref:* ${inspection.docRef} | *Rev:* ${inspection.revNo} | *Date:* ${inspection.issueDate}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🏢 *Division:* ${inspection.divisionName}`);
    lines.push(`🏭 *Department:* ${inspection.departmentName}`);
    lines.push(`📅 *Date:* ${inspection.inspectionDate} | *Shift:* ${inspection.shift}`);
    lines.push(`⚙️ *Machine:* ${inspection.machineNo} | *Operator:* ${inspection.operatorName}`);
    lines.push(`📦 *Part / Item:* *${inspection.itemName}* (${inspection.itemCode})`);
    lines.push(`👨‍🔬 *Prepared By:* ${inspection.inspectorName}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('📏 *DIMENSIONAL CHECKS (5 SAMPLES):*');
    inspection.samples.forEach((s, idx) => {
      const tolStr = `(±${s.tolPlus}${s.unit})`;
      lines.push(`${idx + 1}. *${s.charName}* [Target: ${s.nominal} ${tolStr}]`);
      lines.push(`   Samples: [${[s.s1, s.s2, s.s3, s.s4, s.s5].filter((v) => v !== undefined && v !== null).join(', ')}]`);
      lines.push(`   Avg: *${s.average} ${s.unit}* ➔ *${s.status}*`);
    });
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('👁️ *ATTRIBUTE / VISUAL CHECKS:*');
    inspection.attributes.forEach((a) => {
      lines.push(`• *${a.checkName}:* [${a.checkedQty}/${a.defectsQty}] ➔ *${a.status}*`);
    });
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🏆 *OVERALL RESULT:* *${inspection.overallResult}*`);
    if (inspection.remarks) {
      lines.push(`📝 *Remarks:* ${inspection.remarks}`);
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('📱 _Verified via PWI ERP QMS System_');
    return lines.join('\n');
  };

  const handleCopyWhatsApp = () => {
    const text = buildWhatsAppText();
    navigator.clipboard.writeText(text);
    message.success('QMS Report formatted for WhatsApp copied to clipboard!');
  };

  const handleOpenWhatsApp = () => {
    const text = buildWhatsAppText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      width={850}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button key="wa-copy" icon={<CopyOutlined />} onClick={handleCopyWhatsApp}>
          Copy WhatsApp
        </Button>,
        <Button key="wa" type="default" style={{ color: '#25D366', borderColor: '#25D366' }} icon={<WhatsAppOutlined />} onClick={handleOpenWhatsApp}>
          WhatsApp Share
        </Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
          Print QMS Sheet
        </Button>,
      ]}
    >
      <div id="qms-printable-area" style={{ padding: '8px' }}>
        {/* Printable CSS style block specifically for print media */}
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #qms-printable-area, #qms-printable-area * {
              visibility: visible;
            }
            #qms-printable-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: #ffffff !important;
              color: #000000 !important;
              padding: 20px;
            }
            .no-print {
              display: none !important;
            }
            .qms-table th, .qms-table td {
              border: 1px solid #000000 !important;
              color: #000000 !important;
            }
          }
        `}</style>

        {/* QMS Official Document Header */}
        <div
          style={{
            borderBottom: `2px solid ${token.colorBorder}`,
            paddingBottom: '12px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: token.colorTextHeading, letterSpacing: '0.5px' }}>
              PAKISTAN WIRE INDUSTRIES (PVT.) LTD.
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: token.colorPrimary, marginTop: '2px' }}>
              IN-PROCESS QUALITY INSPECTION REPORT (QMS) — {inspection.divisionName.toUpperCase()}
            </div>
            <div style={{ fontSize: '11px', color: token.colorTextSecondary, marginTop: '2px' }}>
              Factory &amp; Quality Management System • Department: {inspection.departmentName}
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
            <div>
              <Tag color={inspection.overallResult === 'PASS' ? 'success' : 'error'} style={{ fontSize: '12px', fontWeight: 700 }}>
                {inspection.overallResult}
              </Tag>
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
                <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}` }}>Nominal &amp; Tol</th>
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
                    <Tag color={s.status === 'PASS' ? 'success' : 'error'}>{s.status}</Tag>
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
                <Tag color={a.status === 'PASS' ? 'success' : 'error'} style={{ fontWeight: 700 }}>
                  {a.status}
                </Tag>
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
    </Modal>
  );
};

