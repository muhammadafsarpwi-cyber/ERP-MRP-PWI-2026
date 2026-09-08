import React, { useRef, useEffect, useCallback } from 'react';
import { Button, Modal, Space } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import JsBarcode from 'jsbarcode';

interface BarcodeLabelProps {
  open: boolean;
  onClose: () => void;
  entityType: string;
  entityCode: string;
  entityName: string;
  barcode: string | null;
  subtitle?: string;
  companyName?: string;
  extraFields?: { label: string; value: string }[];
}

const BarcodeLabel: React.FC<BarcodeLabelProps> = ({
  open,
  onClose,
  entityType,
  entityCode,
  entityName,
  barcode,
  subtitle,
  companyName = 'PWI ERP',
  extraFields = [],
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (open && svgRef.current && barcode) {
      try {
        JsBarcode(svgRef.current, barcode, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 12,
          font: 'monospace',
          textMargin: 2,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        if (svgRef.current) {
          svgRef.current.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="14">${barcode}</text>`;
        }
      }
    }
  }, [open, barcode]);

  const handlePrint = useCallback(() => {
    if (!printRef.current || !barcode) return;
    const content = printRef.current.innerHTML;
    const w = window.open('', '_blank', 'width=400,height=300');
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html><head><title>Barcode Label - ${entityCode}</title>
<style>
  @page { size: 62mm 38mm; margin: 2mm; }
  body { margin: 0; padding: 4px; font-family: 'Courier New', monospace; font-size: 9px; }
  .label { width: 100%; text-align: center; }
  .company { font-size: 7px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .entity-type { font-size: 7px; color: #666; margin-bottom: 2px; }
  .entity-name { font-size: 8px; font-weight: bold; margin: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .codes { font-size: 7px; margin: 1px 0; }
  .barcode-img { margin: 3px 0; display: flex; justify-content: center; }
  svg { max-width: 100%; }
</style></head><body>
${content}
</body></html>`);
    w.document.close();
    const svgInPrint = w.document.querySelector('svg');
    if (svgInPrint && barcode) {
      try {
        JsBarcode(svgInPrint as SVGSVGElement, barcode, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 12,
          font: 'monospace',
          textMargin: 2,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch { /* fallback */ }
    }
    setTimeout(() => w.print(), 200);
  }, [entityCode, barcode]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={!barcode}>
            Print Label
          </Button>
        </Space>
      }
      title={
        <Space>
          <PrinterOutlined />
          Print {entityType} Barcode Label
        </Space>
      }
      width={400}
      destroyOnHidden
    >
      <div ref={printRef}>
        <div className="label" style={{ border: '1px solid #ccc', padding: 8, borderRadius: 4 }}>
          <div className="company">{companyName}</div>
          <div className="entity-type">{entityType}</div>
          <div className="entity-name">{entityName}</div>
          <div className="codes">
            <div>Code: <strong>{entityCode}</strong></div>
            {extraFields.map((f, i) => (
              <div key={i}>{f.label}: <strong>{f.value}</strong></div>
            ))}
          </div>
          {barcode && (
            <div className="barcode-img">
              <svg ref={svgRef} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default BarcodeLabel;
