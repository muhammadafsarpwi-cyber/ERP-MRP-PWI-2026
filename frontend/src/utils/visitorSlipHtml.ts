import dayjs from 'dayjs';

/**
 * VISITOR SLIP LAYOUT — Prompt #19 §3/§4/§6/§7/§13.
 *
 * ONE source of truth for the slip, used by BOTH the on-screen preview and the
 * printed document, so what the user approves in the preview is literally the
 * markup that goes to the printer. It renders into the project's EXISTING print
 * architecture (`printHtmlContent` → hidden iframe → A4 `@page`), so this phase
 * adds no second printing system.
 *
 * DESIGN RULES ENCODED HERE
 *   • Compact single-subject document, not an invoice or a report: one card of
 *     visitor facts, one host-confirmation block, one reception footer.
 *   • The physical signature area is ALWAYS present and generously sized for
 *     handwriting, whether or not a digital signature was captured (§13).
 *   • The photo is shown undistorted in a fixed box (`object-fit: contain`); a
 *     missing or broken image degrades to a clean placeholder and NEVER stops
 *     the slip from printing (§6, §26).
 *   • Time-In / Time-Out / Status come from the STORED server values that the
 *     caller passes in. A pending visitor prints "Pending" for Time-Out (§27).
 *   • Every interpolated value is HTML-escaped. Visitor-supplied text (name,
 *     company) is untrusted input reaching a print surface, so it can never
 *     inject markup — and the audit/preview paths stay safe too.
 */

/** Fields the slip needs. Mirrors `GET /visitor/entries/:id/slip` (§21). */
export interface VisitorSlipData {
  visitorReference?: string | null;
  companyName?: string | null;
  visitorName?: string | null;
  cnic?: string | null;
  mobile?: string | null;
  visitorCompany?: string | null;
  hostName?: string | null;
  hostDepartment?: string | null;
  division?: { code?: string | null; name?: string | null } | null;
  location?: { code?: string | null; name?: string | null } | null;
  timeIn?: string | null;
  timeOut?: string | null;
  status?: string | null;
  hostConfirmation?: {
    confirmed?: boolean;
    confirmedAt?: string | null;
    confirmedBy?: string | null;
    signatureCapturedAt?: string | null;
    signatureCapturedBy?: string | null;
    hostIdentityVerified?: boolean;
  } | null;
  createdBy?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

/**
 * Images are handed in as data URLs, fetched by the caller through the
 * authenticated API. The slip never builds a URL to a storage path itself —
 * that is what keeps a private photo/signature out of the address bar, the
 * browser history and the print job's resource list (§6, §22).
 */
export interface VisitorSlipAssets {
  photoDataUrl?: string | null;
  signatureDataUrl?: string | null;
}

const SLIP_CSS = `
.visitor-slip {
  font-family: Arial, "Helvetica Neue", Helvetica, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #0f172a;
  max-width: 190mm;
  margin: 0 auto;
  padding: 2mm 1mm;
}
.visitor-slip * { box-sizing: border-box; }
.visitor-slip .vs-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border: 2px solid #0f172a;
  border-bottom: none;
  padding: 7px 10px;
  background: #ffffff;
}
.visitor-slip .vs-logo { width: 46px; height: 46px; object-fit: contain; flex: 0 0 auto; }
.visitor-slip .vs-company { font-size: 13px; font-weight: 900; letter-spacing: 0.4px; text-transform: uppercase; }
.visitor-slip .vs-company-sub { font-size: 9px; color: #475569; font-weight: 600; margin-top: 1px; }
.visitor-slip .vs-title {
  background: #0f172a;
  color: #ffffff;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 2px;
  padding: 6px 12px;
  text-align: center;
  border: 2px solid #0f172a;
}
.visitor-slip .vs-ref-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 2px solid #0f172a;
  border-top: none;
  border-bottom: none;
  padding: 4px 10px;
  background: #f1f5f9;
  font-size: 11px;
  font-weight: 800;
}
.visitor-slip .vs-ref { font-size: 13px; letter-spacing: 0.6px; }
.visitor-slip .vs-body { display: flex; gap: 10px; border: 2px solid #0f172a; padding: 9px 10px; }
.visitor-slip .vs-photo-col { flex: 0 0 78px; text-align: center; }
.visitor-slip .vs-photo {
  width: 78px;
  height: 100px;
  /* A fixed box + contain: an awkward original aspect ratio is letterboxed,
     never stretched. */
  object-fit: contain;
  border: 1px solid #cbd5e1;
  background: #ffffff;
}
.visitor-slip .vs-photo-placeholder {
  width: 78px;
  height: 100px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.visitor-slip .vs-photo-cap { font-size: 7.5px; color: #94a3b8; margin-top: 2px; font-weight: 700; }
.visitor-slip .vs-facts { flex: 1 1 auto; min-width: 0; }
.visitor-slip .vs-section-label {
  font-size: 8.5px;
  font-weight: 900;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #0f172a;
  border-bottom: 1px solid #0f172a;
  padding-bottom: 2px;
  margin-bottom: 5px;
}
.visitor-slip .vs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; }
.visitor-slip .vs-row { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; padding: 1.5px 0; }
.visitor-slip .vs-row-full { grid-column: 1 / -1; }
.visitor-slip .vs-label { color: #64748b; font-weight: 700; white-space: nowrap; }
.visitor-slip .vs-val { font-weight: 700; text-align: right; color: #0f172a; word-break: break-word; }
.visitor-slip .vs-section { margin-top: 8px; }
.visitor-slip .vs-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 3px;
  font-size: 9.5px;
  font-weight: 900;
  letter-spacing: 0.5px;
  border: 1px solid;
}
.visitor-slip .vs-badge-pending { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.visitor-slip .vs-badge-done { background: #dcfce7; color: #166534; border-color: #86efac; }
.visitor-slip .vs-badge-cancelled { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
.visitor-slip .vs-badge-confirmed { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
.visitor-slip .vs-confirm-box {
  border: 1.5px solid #0f172a;
  padding: 7px 9px;
  background: #fafafa;
}
.visitor-slip .vs-sign-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 18px;
  margin-top: 6px;
}
.visitor-slip .vs-sign-line { padding-top: 3px; min-width: 0; }
.visitor-slip .vs-sign-line-full { grid-column: 1 / -1; }
/* §13 — the physical signature area. 48px ≈ 12.7 mm of writable height,
   which is what a handwritten signature actually needs; the other blanks are
   34px ≈ 9 mm, and reception use 26px ≈ 7 mm. */
.visitor-slip .vs-sign-rule { border-bottom: 1px solid #0f172a; height: 34px; }
.visitor-slip .vs-sign-rule-main { height: 48px; }
.visitor-slip .vs-sign-rule-sm { height: 26px; }
.visitor-slip .vs-sign-cap { font-size: 8.5px; font-weight: 700; color: #475569; margin-top: 2px; }
.visitor-slip .vs-sig-image {
  max-width: 190px;
  max-height: 52px;
  object-fit: contain;
  border-bottom: 1px solid #0f172a;
  display: block;
}
.visitor-slip .vs-reception {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: 2px solid #0f172a;
  border-top: none;
  padding: 4px 10px;
  font-size: 8.5px;
  color: #475569;
  font-weight: 700;
  background: #f8fafc;
}
.visitor-slip .vs-foot {
  text-align: center;
  font-size: 7.5px;
  color: #94a3b8;
  border-top: 1px solid #e2e8f0;
  padding-top: 4px;
  margin-top: 5px;
  font-weight: 600;
}
@media print {
  .visitor-slip { max-width: none; padding: 0; }
  /* §8 — never split the signature block away from the slip it belongs to. */
  .visitor-slip .vs-confirm-box,
  .visitor-slip .vs-body { break-inside: avoid; page-break-inside: avoid; }
}
`;

/** Escape for HTML text content AND for quoted attribute values (§30). */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A dash for "not provided" — keeps the grid aligned and never prints `null`. */
const orDash = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text.length > 0 ? text : '—';
};

const statusBadge = (status: string): string => {
  const cls =
    status === 'COMPLETED' ? 'vs-badge-done' : status === 'CANCELLED' ? 'vs-badge-cancelled' : 'vs-badge-pending';
  return `<span class="vs-badge ${cls}">${escapeHtml(status)}</span>`;
};

/**
 * Render a server timestamp the way a printed document should show it:
 * `28-Sep-2026 16:05`.
 *
 * WHY THIS EXISTS
 *   The API sends UTC ISO-8601 (`2026-09-28T16:05:01.271Z`). Printing that
 *   verbatim would put a machine timestamp — millisecond precision and a
 *   trailing `Z` — onto a document a person signs by hand, and it would not
 *   agree with the same visitor's Time-In as shown on the ERP screen. The slip
 *   therefore formats it exactly the way the rest of the ERP renders times
 *   (`DD-MMM-YYYY HH:mm`, local time), so the paper and the screen match.
 *
 *   A value that is missing becomes an em dash, and one that cannot be parsed is
 *   passed through unchanged — a printed slip never says "Invalid Date", and a
 *   stored value is never silently discarded.
 */
function formatStamp(value?: string | null): string {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return '—';
  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY HH:mm') : text;
}

/**
 * Render the complete slip.
 *
 * @param slip   the authorised payload from `GET /visitor/entries/:id/slip`
 * @param assets optional photo/signature images, already fetched by the caller
 * @param logoUrl the ERP logo (optional — the header simply drops it if absent)
 */
export function renderVisitorSlipHtml(
  slip: VisitorSlipData,
  assets: VisitorSlipAssets = {},
  logoUrl?: string | null,
): string {
  const host = slip.hostConfirmation ?? {};
  const confirmed = !!host.confirmed;

  const row = (label: string, value: string, full = false): string =>
    `<div class="vs-row${full ? ' vs-row-full' : ''}"><span class="vs-label">${escapeHtml(label)}</span><span class="vs-val">${value}</span></div>`;

  const raw = (label: string, value: unknown, full = false): string =>
    row(label, escapeHtml(orDash(value)), full);

  const photoBlock = assets.photoDataUrl
    ? `<img class="vs-photo" src="${escapeHtml(assets.photoDataUrl)}" alt="Visitor photo" />`
    : `<div class="vs-photo-placeholder" data-testid="visitor-slip-photo-placeholder">No<br />Photo</div>`;

  const confirmation = confirmed
    ? row('Host Confirmation:', '<span class="vs-badge vs-badge-confirmed">CONFIRMED</span>')
    : row('Host Confirmation:', '<span class="vs-badge vs-badge-pending">PENDING</span>');

  // §17 — the slip states the truth about identity rather than implying a
  // verification the system never performed.
  const identityNote = confirmed && host.hostIdentityVerified === false
    ? `<div class="vs-row vs-row-full"><span class="vs-label">Confirmed By:</span><span class="vs-val">${escapeHtml(orDash(host.confirmedBy))} <span style="font-weight:600; color:#64748b;">(ERP user — host identity not verified)</span></span></div>`
    : '';

  // §13 — the BLANK, handwritten signature area is unconditional. A captured
  // digital signature is printed as an ADDITIONAL, separately-labelled line and
  // never replaces the physical blank, so a slip that already carries a digital
  // signature can still be signed by hand at the gate.
  const physicalSignatureLine = `
        <div class="vs-sign-line">
          <div class="vs-sign-rule vs-sign-rule-main"></div>
          <div class="vs-sign-cap">Host Signature</div>
        </div>`;

  const digitalSignatureLine = assets.signatureDataUrl
    ? `<div class="vs-sign-line">
         <img class="vs-sig-image" src="${escapeHtml(assets.signatureDataUrl)}" alt="Host signature" />
         <div class="vs-sign-cap">Host Signature — digital, captured ${escapeHtml(formatStamp(host.signatureCapturedAt))}</div>
       </div>`
    : '';

  return `
<style>${SLIP_CSS}</style>
<div class="visitor-slip" data-testid="visitor-slip-document">
  <div class="vs-header">
    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
      ${logoUrl ? `<img class="vs-logo" src="${escapeHtml(logoUrl)}" alt="" />` : ''}
      <div style="min-width: 0;">
        <div class="vs-company">${escapeHtml(slip.companyName || 'Pakistan Wire Industries (Pvt) Ltd.')}</div>
        <div class="vs-company-sub">Security &amp; Reception — Lahore, Pakistan</div>
      </div>
    </div>
    <div style="text-align: right; flex: 0 0 auto;">
      <div style="font-size: 11px; font-weight: 900; letter-spacing: 2px;">VISITOR SLIP</div>
      <div style="font-size: 8px; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">RETAIN THIS SLIP FOR DEPARTURE</div>
    </div>
  </div>

  <div class="vs-ref-bar">
    <span>VISITOR ID</span>
    <span class="vs-ref">${escapeHtml(orDash(slip.visitorReference))}</span>
    <span>${statusBadge(orDash(slip.status))}</span>
  </div>

  <div class="vs-body">
    <div class="vs-photo-col">
      ${photoBlock}
      <div class="vs-photo-cap">PHOTO</div>
    </div>

    <div class="vs-facts">
      <div class="vs-section-label">VISITOR INFORMATION</div>
      <div class="vs-grid">
        ${raw('Visitor Name', slip.visitorName, true)}
        ${raw('CNIC', slip.cnic)}
        ${raw('Mobile', slip.mobile)}
        ${raw('Company / Source', slip.visitorCompany, true)}
      </div>

      <div class="vs-section">
        <div class="vs-section-label">PERSON BEING VISITED (HOST)</div>
        <div class="vs-grid">
          ${raw('Host Name', slip.hostName, true)}
          ${raw('Department', slip.hostDepartment)}
          ${raw('Division', slip.division?.name || slip.division?.code)}
          ${raw('Location', slip.location?.name || slip.location?.code)}
        </div>
      </div>

      <div class="vs-section">
        <div class="vs-section-label">VISIT</div>
        <div class="vs-grid">
          ${raw('Time-In', formatStamp(slip.timeIn))}
          ${row(
            'Time-Out',
            slip.timeOut
              ? escapeHtml(formatStamp(slip.timeOut))
              : '<span style="color:#92400e;">Pending</span>',
          )}
          ${row('Status', statusBadge(orDash(slip.status)))}
          ${confirmation}
          ${identityNote}
        </div>
      </div>
    </div>
  </div>

  <div class="vs-section">
    <div class="vs-confirm-box">
      <div class="vs-section-label">HOST CONFIRMATION</div>
      <div style="font-size: 9px; color: #475569; font-weight: 600; margin-bottom: 3px;">
        The host signs below to confirm the visitor reached them. This slip must be
        returned to Security on departure.
      </div>
      <div class="vs-sign-grid">
        ${physicalSignatureLine}
        ${digitalSignatureLine}
        <div class="vs-sign-line">
          <div class="vs-sign-rule"></div>
          <div class="vs-sign-cap">Host Name</div>
        </div>
        <div class="vs-sign-line">
          <div class="vs-sign-rule vs-sign-rule-sm"></div>
          <div class="vs-sign-cap">Date / Time</div>
        </div>
        <div class="vs-sign-line vs-sign-line-full">
          <div class="vs-sign-rule vs-sign-rule-sm"></div>
          <div class="vs-sign-cap">Security / Reception Use</div>
        </div>
      </div>
    </div>
  </div>

  <div class="vs-reception">
    <span>Created By: ${escapeHtml(orDash(slip.createdBy))}</span>
    <span>Created At: ${escapeHtml(formatStamp(slip.createdAt))}</span>
  </div>

  <div class="vs-foot">
    This slip is issued by Security at the gate. Time-In and Time-Out are recorded by the
    system. Host confirmation does not record the visitor's departure.
  </div>
</div>
`;
}
