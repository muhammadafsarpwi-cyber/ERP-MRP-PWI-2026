import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Modal, Space, Spin, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { printVisitorSlipDocument } from '../../utils/printTemplates';
import { loadVisitorSlipAssets } from '../../utils/visitorSlipAssets';
import { renderVisitorSlipHtml, type VisitorSlipAssets, type VisitorSlipData } from '../../utils/visitorSlipHtml';

/**
 * VISITOR SLIP PREVIEW (Prompt #19 §9 / §10 / §21 / §26).
 *
 * "Print Visitor Slip" opens a preview of the real document, built from the
 * AUTHORISED `GET /visitor/entries/:id/slip` payload, with the same
 * `renderVisitorSlipHtml` markup the printout uses — so what is reviewed here is
 * literally what reaches the printer.
 *
 * PROPERTIES THIS COMPONENT IS RESPONSIBLE FOR
 *   • Opening the preview MUTATES NOTHING. It issues GET requests only; there is
 *     no PUT/PATCH/POST anywhere in this file (§9, §25).
 *   • Re-print works from the same path as a first print: the slip is always
 *     generated from the stored visitor record, never from the row the user
 *     happened to be looking at, and no new visitor record is ever created
 *     (§10).
 *   • A completed visitor stays printable, and the slip then shows the real
 *     Time-In + Time-Out + COMPLETED (§29).
 *   • A failed or missing image never blocks the print: the slip degrades to a
 *     placeholder (§26).
 *   • Photos and signatures are fetched WITH the session and inlined as data
 *     URLs, so a private storage path is never exposed as a URL (§6, §22).
 */
export interface VisitorSlipPreviewProps {
  open: boolean;
  /** Visitor id; the slip is re-read from the server on every open. */
  visitorId: string | null;
  onClose: () => void;
  /** Shown in the modal title so a re-print is unambiguous. */
  visitorLabel?: string | null;
  testId?: string;
}

function logoUrl(): string | null {
  if (typeof window === 'undefined' || !window.location?.origin) return '/logo.png';
  return `${window.location.origin}/logo.png`;
}

export function VisitorSlipPreview({
  open,
  visitorId,
  onClose,
  visitorLabel,
  testId = 'visitor-slip-preview',
}: VisitorSlipPreviewProps) {
  const { message } = App.useApp();
  const [slip, setSlip] = useState<VisitorSlipData | null>(null);
  const [assets, setAssets] = useState<VisitorSlipAssets>({});
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  // A photo/signature that could not be loaded is reported, never hidden: the
  // user should know the printed copy is missing an image (§26).
  const [imageWarning, setImageWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open || !visitorId) return;
    setLoading(true);
    setImageWarning(null);
    try {
      const res = await apiService.get<{ data?: VisitorSlipData }>(`/visitor/entries/${visitorId}/slip`);
      const data = res?.data ?? null;
      setSlip(data);

      if (!data) {
        setAssets({});
        return;
      }

      // Images are best-effort and independent of the document itself.
      const loaded = await loadVisitorSlipAssets({
        fetchBlob: (path: string) => apiService.getFile<Blob>(path),
        photoPath: (data.photoUrl as string | null) ?? null,
        signaturePath: (data.signatureUrl as string | null) ?? null,
        hasPhoto: !!data.hasPhoto,
        hasSignature: !!data.hasSignature,
      });
      setAssets(loaded);

      if (data.hasPhoto && !loaded.photoDataUrl) {
        setImageWarning('The visitor photo could not be loaded — the slip will print without it.');
      } else if (data.hasSignature && !loaded.signatureDataUrl) {
        setImageWarning('The captured signature could not be loaded — the slip will print without it.');
      }
    } catch (error) {
      setSlip(null);
      setAssets({});
      message.error(
        error instanceof Error ? error.message : 'Could not load the visitor slip for printing.',
      );
    } finally {
      setLoading(false);
    }
  }, [open, visitorId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  // Never leave a previous visitor's slip on screen while the next one loads.
  useEffect(() => {
    if (!open) {
      setSlip(null);
      setAssets({});
      setImageWarning(null);
    }
  }, [open]);

  const html = useMemo(
    () => (slip ? renderVisitorSlipHtml(slip, assets, logoUrl()) : ''),
    [slip, assets],
  );

  const print = () => {
    if (!slip) return;
    setPrinting(true);
    try {
      // The SAME payload the preview rendered — no second fetch, no drift.
      printVisitorSlipDocument(slip, assets);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not open the print dialog.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      title={`Print Visitor Slip${visitorLabel ? ` — ${visitorLabel}` : ''}`}
      open={open}
      onCancel={onClose}
      width={860}
      destroyOnHidden
      data-testid={testId}
      footer={
        <Space>
          <Button onClick={onClose} data-testid={`${testId}-cancel`}>
            Cancel
          </Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            loading={printing}
            disabled={!slip}
            onClick={print}
            data-testid={`${testId}-print`}
          >
            Print
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : slip ? (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Preview only — nothing is saved by printing. The slip can be re-printed at any time from Visitor Detail."
            data-testid={`${testId}-notice`}
          />
          {imageWarning ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={imageWarning}
              data-testid={`${testId}-image-warning`}
            />
          ) : null}
          <div
            style={{ background: '#f1f5f9', padding: 12, overflow: 'auto', maxHeight: '58vh' }}
            data-testid={`${testId}-canvas`}
          >
            {/* The slip markup is fully escaped by `renderVisitorSlipHtml` — every
                visitor-supplied value is encoded before it reaches this point. */}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </>
      ) : (
        <Typography.Text type="secondary" data-testid={`${testId}-empty`}>
          The visitor slip could not be loaded. You may not have access to this visitor record.
        </Typography.Text>
      )}
    </Modal>
  );
}

export default VisitorSlipPreview;
