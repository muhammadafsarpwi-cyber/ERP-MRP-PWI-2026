import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Modal, Space, Spin, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { printVisitorSlipDocument } from '../../utils/printTemplates';
import { loadVisitorSlipAssets } from '../../utils/visitorSlipAssets';
import { fitSlipToWidth, type SlipFit } from '../../utils/visitorSlipFit';
import { renderVisitorSlipHtml, type VisitorSlipAssets, type VisitorSlipData } from '../../utils/visitorSlipHtml';
import './visitorSlipPreview.css';

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
 *
 * PROMPT #19B §4/§5 — FITTING THE PREVIEW WITHOUT TOUCHING THE PRINT
 *   The preview shows the REAL A4 document, scaled to fit. It is not a
 *   reflowed mobile variant: before #19B the preview let the slip collapse to
 *   the width of a phone modal, which squeezed the header grid and broke the
 *   letterhead into "PAKIS / TAN / WIRE / INDUS / TRIES". The slip is now
 *   pinned to its 190 mm print width and scaled down as a whole, so the header,
 *   the columns and the signature box are pixel-identical to the printed page
 *   at every screen size, and nothing overflows the viewport.
 *
 *   The scaling is `transform: scale()` on a PREVIEW-ONLY wrapper
 *   (`visitorSlipPreview.css`). The slip markup is untouched, the print
 *   stylesheet is untouched, and the print job — which is rendered into a
 *   separate document by `printHtmlContent()` — never sees these rules. Preview
 *   and print therefore still share one source of truth: the same HTML string
 *   produced by `renderVisitorSlipHtml`.
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

  // The document markup, from the same `renderVisitorSlipHtml` the printout
  // uses. Declared before the fit below because "is there a document at all"
  // is one of the fit's inputs.
  const html = useMemo(
    () => (slip ? renderVisitorSlipHtml(slip, assets, logoUrl()) : ''),
    [slip, assets],
  );

  // ── #19B §4/§5 — measure the unscaled document and the space it may use ──
  const stageRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<SlipFit>({ scale: 1, width: 0, height: 0, scrolls: false });

  /**
   * Re-fit whenever the document is measured, the stage resizes, or the modal
   * layout settles. `offsetWidth`/`offsetHeight` are used deliberately: a CSS
   * transform does not change them, so the fit cannot feed back on itself the way
   * `getBoundingClientRect()` would.
   */
  const refit = useCallback(() => {
    const stage = stageRef.current;
    const doc = docRef.current;
    if (!stage || !doc) return;
    setFit(
      fitSlipToWidth(
        doc.offsetWidth,
        doc.offsetHeight,
        stage.clientWidth,
      ),
    );
  }, []);

  // #19B §4/§5 — the ResizeObserver callback re-observes whenever the document
  // itself changes, because a new document can have a different natural size
  // even at the same stage width. `hasDocument` is extracted from `html` so the
  // dependency array stays statically checkable.
  const hasDocument = html.length > 0;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    // Rotation, window resize, and the modal finishing its open animation all
    // change the available width without re-rendering this component.
    const observer = new ResizeObserver(() => refit());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [refit, open, hasDocument]);

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

  // ── #19B §4/§5 — fit the rendered document into whatever space the modal has ──
  // These sit AFTER `html` because the document only exists once the markup
  // string is built: the fit is a measurement of real rendered geometry, not a
  // guess made from the data.
  useLayoutEffect(() => {
    if (!html) return;
    refit();
  }, [html, refit]);

  // A freshly loaded document replaces the previous one; drop the stale fit so
  // the frame never briefly shows the old document's size.
  useEffect(() => {
    if (!html) setFit({ scale: 1, width: 0, height: 0, scrolls: false });
  }, [html]);

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
      // #19B §1 — the same viewport cap the other Visitor Management dialogs
      // use. The document canvas already carries its own 58vh limit; this stops
      // the notices above it from pushing the Print button off a short screen.
      styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
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
                visitor-supplied value is encoded before it reaches this point.

                #19B §4/§5 — the document is pinned to its A4 width and scaled to
                fit (see `visitorSlipFit` / `visitorSlipPreview.css`). This
                wrapper is modal-only: the print job is a different document. */}
            <div className="vs-preview-stage" ref={stageRef} data-testid={`${testId}-stage`}>
              <div
                className="vs-preview-frame"
                data-testid={`${testId}-frame`}
                data-scale={fit.scale.toFixed(4)}
                data-scrolls={fit.scrolls ? 'true' : 'false'}
                style={
                  fit.width > 0
                    ? ({
                        width: fit.width,
                        // Ceil absorbs sub-pixel rounding so the last line of the
                        // document is never clipped by a 0.3px shortfall.
                        height: Math.ceil(fit.height),
                        // A CSS transform does not change layout size, so the
                        // document's LAYOUT box is always the full 718px and the
                        // frame would always report itself as horizontally
                        // scrollable — showing a scrollbar over a preview that
                        // visually fits. Clipping keeps it honest: the frame only
                        // becomes scrollable when the fit floor actually bites.
                        overflowX: fit.scrolls ? 'auto' : 'hidden',
                        overflowY: 'hidden',
                        // The scale drives the transform; the two together keep
                        // the frame exactly the size of what it is showing.
                        '--vs-preview-scale': fit.scale,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <div
                  className="vs-preview-doc"
                  ref={docRef}
                  data-testid={`${testId}-doc`}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </div>
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
