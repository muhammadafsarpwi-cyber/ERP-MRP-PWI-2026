import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Alert, Button, Modal, Space, Typography, Segmented, QRCode } from 'antd';
import { PrinterOutlined, QrcodeOutlined, BarcodeOutlined, AppstoreOutlined } from '@ant-design/icons';
import JsBarcode from 'jsbarcode';

const { Text } = Typography;

export type BarcodePrintFormat = 'BARCODE' | 'QR' | 'BOTH';

interface BarcodePrintProps {
  open: boolean;
  onClose: () => void;
  itemCode: string;
  itemName: string;
  sku?: string | null;
  barcode?: string | null;
  companyName?: string;
  initialFormat?: BarcodePrintFormat;
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
  companyName = 'Pakistan Wire Industries (Pvt) Ltd',
  initialFormat = 'BOTH',
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [format, setFormat] = useState<BarcodePrintFormat>(initialFormat);
  const renderAttempted = useRef(false);

  // Fallback to itemCode if barcode prop is empty/null
  const effectiveBarcode = barcode || itemCode || '';

  useEffect(() => {
    if (open && initialFormat) {
      setFormat(initialFormat);
    }
  }, [open, initialFormat]);

  const attemptRender = useCallback(() => {
    if (!effectiveBarcode) return;
    const svg = svgRef.current;
    if (!svg) return;
    const ok = renderBarcode(svg, effectiveBarcode);
    setRenderError(ok ? null : `Failed to render barcode: ${effectiveBarcode}`);
    renderAttempted.current = true;
  }, [effectiveBarcode]);

  useEffect(() => {
    renderAttempted.current = false;
    setRenderError(null);
    if (!open || !effectiveBarcode) return;

    if (format === 'BARCODE' || format === 'BOTH') {
      const timers: NodeJS.Timeout[] = [];
      [0, 50, 150, 300].forEach((delay) => {
        timers.push(setTimeout(() => {
          if (!renderAttempted.current) {
            attemptRender();
          }
        }, delay));
      });
      return () => timers.forEach(clearTimeout);
    }
  }, [open, effectiveBarcode, format, attemptRender]);

  const svgCallbackRef = useCallback((node: SVGSVGElement | null) => {
    (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = node;
    if (node && open && effectiveBarcode && !renderAttempted.current) {
      requestAnimationFrame(() => {
        attemptRender();
      });
    }
  }, [open, effectiveBarcode, attemptRender]);

  const handlePrint = useCallback(() => {
    if (!effectiveBarcode) return;

    // Get QR SVG markup if needed
    let qrSvgMarkup = '';
    if (qrRef.current) {
      const svgEl = qrRef.current.querySelector('svg');
      if (svgEl) {
        qrSvgMarkup = svgEl.outerHTML;
      }
    }

    const printHtml = `<!DOCTYPE html>
<html><head><title>Label - ${itemCode}</title>
<style>
  @page { size: 62mm 45mm; margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4px; font-family: 'Courier New', monospace; font-size: 9px; background: #ffffff; color: #000000; }
  .label { width: 100%; text-align: center; border: 1px solid #999999; padding: 4px; border-radius: 4px; }
  .company { font-size: 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; color: #000000; }
  .item-name { font-size: 9px; font-weight: bold; margin: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; color: #000000; }
  .codes { font-size: 7.5px; margin: 1px 0; color: #000000; }
  .codes div { margin: 1px 0; }
  .codes strong { color: #000000; }
  .combo-container { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 4px 0; }
  .qr-box { display: flex; justify-content: center; align-items: center; }
  .qr-box svg { width: 70px; height: 70px; }
  .barcode-box { display: flex; justify-content: center; align-items: center; }
  .barcode-box svg { max-width: 100%; }
</style></head><body>
<div class="label">
  <div class="company">${companyName}</div>
  <div class="item-name">${itemName}</div>
  <div class="codes">
    <div>Code: <strong>${itemCode}</strong></div>
    ${sku ? `<div>SKU / Cat: <strong>${sku}</strong></div>` : ''}
    <div>Value: <strong>${effectiveBarcode}</strong></div>
  </div>

  ${format === 'QR' ? `
    <div class="qr-box" style="margin: 6px 0;">
      ${qrSvgMarkup}
    </div>
  ` : format === 'BARCODE' ? `
    <div class="barcode-box" style="margin: 4px 0;">
      <svg id="print-barcode"></svg>
    </div>
  ` : `
    <div class="combo-container">
      <div class="qr-box">${qrSvgMarkup}</div>
      <div class="barcode-box" style="flex: 1;"><svg id="print-barcode"></svg></div>
    </div>
  `}
</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=450,height=350');
    if (!w) return;
    w.document.write(printHtml);
    w.document.close();

    if (format === 'BARCODE' || format === 'BOTH') {
      const svgInPrint = w.document.getElementById('print-barcode') as SVGSVGElement | null;
      if (svgInPrint && effectiveBarcode) {
        renderBarcode(svgInPrint, effectiveBarcode);
      }
    }

    setTimeout(() => {
      w.print();
    }, 300);
  }, [itemCode, itemName, sku, effectiveBarcode, companyName, format]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      zIndex={1300}
      wrapClassName="erp-barcode-modal-wrap"
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={!effectiveBarcode}>
            Print Label
          </Button>
        </Space>
      }
      title={
        <Space>
          <QrcodeOutlined style={{ color: '#38bdf8' }} />
          <BarcodeOutlined style={{ color: '#60a5fa' }} />
          <span>Print Barcode & QR Code Label</span>
        </Space>
      }
      width={460}
      destroyOnHidden
    >
      <div style={{ marginBottom: 14, textAlign: 'center' }}>
        <Segmented
          value={format}
          onChange={(val) => {
            setFormat(val as BarcodePrintFormat);
            renderAttempted.current = false;
          }}
          options={[
            { label: 'Combo (Both)', value: 'BOTH', icon: <AppstoreOutlined /> },
            { label: 'QR Code (2D)', value: 'QR', icon: <QrcodeOutlined /> },
            { label: 'Barcode (1D)', value: 'BARCODE', icon: <BarcodeOutlined /> },
          ]}
        />
      </div>

      <div ref={printRef}>
        <div
          style={{
            background: 'var(--theme-surface-alt, #15182e)',
            padding: 16,
            borderRadius: 8,
            border: '1px solid var(--theme-border, rgba(255,255,255,0.12))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Authentic Physical Thermal Sticker Label Preview */}
          <div
            style={{
              width: '100%',
              maxWidth: 320,
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: 6,
              padding: '14px 12px',
              border: '1px solid #cbd5e1',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 3,
                textAlign: 'center',
                color: '#475569',
              }}
            >
              {companyName}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                margin: '3px 0',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#0f172a',
              }}
            >
              {itemName}
            </div>
            <div
              style={{
                fontSize: 11,
                margin: '4px 0',
                textAlign: 'center',
                color: '#334155',
                lineHeight: 1.4,
              }}
            >
              <div>Code: <strong style={{ color: '#0f172a' }}>{itemCode}</strong></div>
              {sku && <div>Category / SKU: <strong style={{ color: '#0f172a' }}>{sku}</strong></div>}
              <div style={{ marginTop: 2 }}>
                Value: <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, color: '#0f172a', fontWeight: 600, border: '1px solid #e2e8f0', fontSize: 10.5 }}>{effectiveBarcode || 'N/A'}</span>
              </div>
            </div>

            {/* Hidden reference for QR SVG in ALL formats so print can extract SVG */}
            <div style={{ display: 'none' }}>
              {effectiveBarcode && (
                <div ref={qrRef}>
                  <QRCode value={effectiveBarcode} type="svg" size={90} bordered={false} color="#000000" bgColor="#ffffff" />
                </div>
              )}
            </div>

            {effectiveBarcode ? (
              <div style={{ marginTop: 10 }}>
                {format === 'QR' && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
                    <QRCode value={effectiveBarcode} type="svg" size={130} color="#000000" bgColor="#ffffff" />
                  </div>
                )}

                {format === 'BARCODE' && (
                  <div style={{ margin: '6px 0', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
                    <svg ref={svgCallbackRef} style={{ maxWidth: '100%' }} />
                  </div>
                )}

                {format === 'BOTH' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ padding: 4, background: '#ffffff', borderRadius: 4 }}>
                      <QRCode value={effectiveBarcode} type="svg" size={90} color="#000000" bgColor="#ffffff" />
                    </div>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
                      <svg ref={svgCallbackRef} style={{ maxWidth: '100%' }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px 0', textAlign: 'center', color: '#64748b', fontSize: 11 }}>
                No barcode / QR code assigned
              </div>
            )}

            {renderError && (
              <Alert type="error" showIcon message="Barcode Render Error" description={renderError} style={{ marginTop: 8 }} />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BarcodePrint;
