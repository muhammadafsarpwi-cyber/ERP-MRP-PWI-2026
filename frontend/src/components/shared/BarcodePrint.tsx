import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Alert, Button, Modal, Space, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import JsBarcode from 'jsbarcode';

const { Text } = Typography;

interface BarcodePrintProps {
  open: boolean;
  onClose: () => void;
  itemCode: string;
  itemName: string;
  sku?: string | null;
  barcode?: string | null;
  companyName?: string;
}

const renderBarcode = (svg: SVGSVGElement, value: string): boolean => {
  try {
    JsBarcode(svg, value, {
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
    return true;
  } catch (err) {
    console.error('JsBarcode render error:', err);
    svg.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="14" fill="#cc0000">Render error: ${value}</text>`;
    return false;
  }
};

const BarcodePrint: React.FC<BarcodePrintProps> = ({
  open,
  onClose,
  itemCode,
  itemName,
  sku,
  barcode,
  companyName = 'PWI ERP',
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderAttempted = useRef(false);

  const attemptRender = useCallback(() => {
    if (!barcode) return;
    const svg = svgRef.current;
    if (!svg) return;
    const ok = renderBarcode(svg, barcode);
    setRenderError(ok ? null : `Failed to render barcode: ${barcode}`);
    renderAttempted.current = true;
  }, [barcode]);

  useEffect(() => {
    renderAttempted.current = false;
    setRenderError(null);
    if (!open || !barcode) return;

    const timers: NodeJS.Timeout[] = [];

    [0, 50, 150, 300].forEach((delay) => {
      timers.push(setTimeout(() => {
        if (!renderAttempted.current) {
          attemptRender();
        }
      }, delay));
    });

    return () => timers.forEach(clearTimeout);
  }, [open, barcode, attemptRender]);

  const svgCallbackRef = useCallback((node: SVGSVGElement | null) => {
    (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = node;
    if (node && open && barcode && !renderAttempted.current) {
      requestAnimationFrame(() => {
        attemptRender();
      });
    }
  }, [open, barcode, attemptRender]);

  const handlePrint = useCallback(() => {
    if (!printRef.current || !barcode) return;

    const printHtml = `<!DOCTYPE html>
<html><head><title>Barcode Label - ${itemCode}</title>
<style>
  @page { size: 62mm 38mm; margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4px; font-family: 'Courier New', monospace; font-size: 9px; background: #ffffff; color: #000000; }
  .label { width: 100%; text-align: center; border: 1px solid #cccccc; padding: 4px; }
  .company { font-size: 7px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; color: #000000; }
  .item-name { font-size: 8px; font-weight: bold; margin: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; color: #000000; }
  .codes { font-size: 7px; margin: 1px 0; color: #000000; }
  .codes div { margin: 1px 0; }
  .codes strong { color: #000000; }
  .barcode-img { margin: 3px 0; display: flex; justify-content: center; }
  svg { max-width: 100%; }
</style></head><body>
<div class="label">
  <div class="company">${companyName}</div>
  <div class="item-name">${itemName}</div>
  <div class="codes">
    <div>Code: <strong>${itemCode}</strong></div>
    ${sku ? `<div>SKU: <strong>${sku}</strong></div>` : ''}
  </div>
  <div class="barcode-img"><svg id="print-barcode"></svg></div>
</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=400,height=300');
    if (!w) return;
    w.document.write(printHtml);
    w.document.close();

    const svgInPrint = w.document.getElementById('print-barcode') as SVGSVGElement | null;
    if (svgInPrint && barcode) {
      renderBarcode(svgInPrint, barcode);
    }

    setTimeout(() => {
      w.print();
    }, 300);
  }, [itemCode, itemName, sku, barcode, companyName]);

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
          Print Barcode Label
        </Space>
      }
      width={400}
      destroyOnHidden
    >
      <div ref={printRef}>
        <div
          style={{
            border: '1px solid var(--theme-border, #d9d9d9)',
            padding: 12,
            borderRadius: 6,
            background: 'var(--theme-bg, #ffffff)',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
              textAlign: 'center',
              color: 'var(--theme-text, #000000)',
            }}
          >
            {companyName}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 'bold',
              margin: '4px 0',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--theme-text, #000000)',
            }}
          >
            {itemName}
          </div>
          <div
            style={{
              fontSize: 11,
              margin: '2px 0',
              textAlign: 'center',
              color: 'var(--theme-text, #000000)',
            }}
          >
            <div>Item Code: <strong>{itemCode}</strong></div>
            {sku && <div>SKU: <strong>{sku}</strong></div>}
          </div>
          {barcode && (
            <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'center' }}>
              <svg ref={svgCallbackRef} style={{ maxWidth: '100%' }} />
            </div>
          )}
          {!barcode && (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>No barcode assigned</Text>
            </div>
          )}
          {renderError && (
            <Alert type="error" showIcon message="Barcode Render Error" description={renderError} style={{ marginTop: 8 }} />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default BarcodePrint;
