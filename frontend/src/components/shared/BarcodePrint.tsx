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
  companyName = 'PWI ERP',
  initialFormat = 'BOTH',
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [format, setFormat] = useState<BarcodePrintFormat>(initialFormat);
  const renderAttempted = useRef(false);

  useEffect(() => {
    if (open && initialFormat) {
      setFormat(initialFormat);
    }
  }, [open, initialFormat]);

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
  }, [open, barcode, format, attemptRender]);

  const svgCallbackRef = useCallback((node: SVGSVGElement | null) => {
    (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = node;
    if (node && open && barcode && !renderAttempted.current) {
      requestAnimationFrame(() => {
        attemptRender();
      });
    }
  }, [open, barcode, attemptRender]);

  const handlePrint = useCallback(() => {
    if (!barcode) return;

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
    ${sku ? `<div>SKU: <strong>${sku}</strong></div>` : ''}
    <div>Value: <strong>${barcode}</strong></div>
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
      if (svgInPrint && barcode) {
        renderBarcode(svgInPrint, barcode);
      }
    }

    setTimeout(() => {
      w.print();
    }, 300);
  }, [itemCode, itemName, sku, barcode, companyName, format]);

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
          <QrcodeOutlined style={{ color: '#1677ff' }} />
          <BarcodeOutlined />
          Print Barcode & QR Code Label
        </Space>
      }
      width={460}
      destroyOnHidden
    >
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
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
            border: '1px solid var(--theme-border, #d9d9d9)',
            padding: 14,
            borderRadius: 8,
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
              fontSize: 14,
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
            <div>Code: <strong>{itemCode}</strong></div>
            {sku && <div>SKU: <strong>{sku}</strong></div>}
            <div style={{ fontSize: 10, color: 'var(--theme-text-secondary, #666)' }}>
              Value: <Text code>{barcode}</Text>
            </div>
          </div>

          {/* Hidden reference for QR SVG in ALL formats so print can extract SVG */}
          <div style={{ display: 'none' }}>
            {barcode && (
              <div ref={qrRef}>
                <QRCode value={barcode} type="svg" size={90} bordered={false} />
              </div>
            )}
          </div>

          {barcode ? (
            <div style={{ marginTop: 12 }}>
              {format === 'QR' && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
                  <QRCode value={barcode} type="svg" size={130} />
                </div>
              )}

              {format === 'BARCODE' && (
                <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'center' }}>
                  <svg ref={svgCallbackRef} style={{ maxWidth: '100%' }} />
                </div>
              )}

              {format === 'BOTH' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ padding: 4 }}>
                    <QRCode value={barcode} type="svg" size={100} />
                  </div>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <svg ref={svgCallbackRef} style={{ maxWidth: '100%' }} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>No barcode / QR code assigned</Text>
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
