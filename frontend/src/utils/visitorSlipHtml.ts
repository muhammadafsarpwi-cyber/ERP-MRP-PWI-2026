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
    /** #19A §2 — the NAME to print. Never render `confirmedBy`. */
    confirmedByName?: string | null;
    signatureCapturedAt?: string | null;
    signatureCapturedBy?: string | null;
    signatureCapturedByName?: string | null;
    hostIdentityVerified?: boolean;
  } | null;
  createdBy?: string | null;
  /** #19A §2 — the NAME to print. Never render `createdBy`. */
  createdByName?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

/**
 * #19A §3/§4 — the printed letterhead, as a CONSTANT.
 *
 * WHY NOT `slip.companyName`
 *   Every other printed document in this ERP states its letterhead as a literal
 *   (`printTemplates.ts` → "PAKISTAN WIRE INDUSTRIES (PVT) LTD" on the invoice,
 *   the dispatch note and the weighbridge slip). The visitor slip is the same
 *   class of document: a pre-printed stationery item for one site. The API
 *   still returns the `companies` row, and it is still used for authorization
 *   (org scope, division scope) — but the NAME ON THE PAPER is the production
 *   legal name of this deployment, not whatever a test fixture row happens to
 *   contain in a given database.
 *
 *   A full street/site address is deliberately NOT present: the site address
 *   has not been supplied, and inventing one on a security document would be
 *   worse than omitting it (#19A §8).
 */
export const SLIP_COMPANY_NAME = 'Pakistan Wire Industries (Pvt.) LTD.';
export const SLIP_COMPANY_CITY = 'Karachi, Pakistan';
export const SLIP_COMPANY_UNIT = 'Security & Reception';

/** #19A §2 — shown when the API could not resolve the acting ERP user. */
export const SLIP_ACTOR_FALLBACK = 'System User';

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
/* #19A section 5 - HEADER GRID.
   The header is a real 2x3 grid, not a flex row of two independently sized
   stacks. A flex row cannot align them: centring the brand block (a 44px logo
   beside two text lines) against the headline block (a 27px title bar over an
   11px note) puts the block CENTRES on one line but leaves the title bar
   itself 7px above the logo, because a title-and-caption stack is not
   vertically symmetric about its own centre.

   The grid removes the ambiguity. Row 1 carries the company name and the title
   bar; row 2 carries the city line and the "retain this slip" caption. Both
   cells of a row are centred in the same row box, so each pair shares one
   baseline by construction rather than by eye. The logo spans both rows and is
   centred against the block, which is what keeps it level with the name. */
.visitor-slip .vs-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 3px;
  border: 2px solid #0f172a;
  border-bottom: none;
  padding: 7px 10px;
  background: #ffffff;
}
/* Explicit line-heights (not the UA default) give every cell a known height, so
   the centring is reproducible across font stacks. */
.visitor-slip .vs-logo {
  grid-column: 1;
  grid-row: 1 / 3;
  width: 44px;
  height: 44px;
  object-fit: contain;
}
.visitor-slip .vs-company {
  grid-column: 2;
  grid-row: 1;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  line-height: 16px;
}
.visitor-slip .vs-company-sub {
  grid-column: 2;
  grid-row: 2;
  font-size: 8.5px;
  color: #475569;
  font-weight: 700;
  line-height: 12px;
}
.visitor-slip .vs-title {
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  background: #0f172a;
  color: #ffffff;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 2.5px;
  line-height: 15px;
  padding: 6px 12px;
  text-align: center;
  white-space: nowrap;
}
.visitor-slip .vs-headline-note {
  grid-column: 3;
  grid-row: 2;
  justify-self: end;
  font-size: 8px;
  color: #64748b;
  font-weight: 800;
  letter-spacing: 0.6px;
  line-height: 12px;
  white-space: nowrap;
}
/* #19A §5 — the VISITOR ID row is a real 3-column grid, so the reference is
   optically centred on the page instead of drifting wherever flexbox happens to
   put it between a long label and a wide status badge. */
.visitor-slip .vs-ref-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  border: 2px solid #0f172a;
  border-top: none;
  border-bottom: none;
  padding: 5px 10px;
  background: #f1f5f9;
  font-size: 10px;
  font-weight: 800;
}
.visitor-slip .vs-ref-label { letter-spacing: 0.6px; }
.visitor-slip .vs-ref {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 1px;
  text-align: center;
}
.visitor-slip .vs-ref-status { text-align: right; }
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
/* #19A section 6 - baseline (not the flex default stretch) so a label and its
   value share one first-line baseline. With stretch, a two-line value left the
   label floating against the middle of its own text, which is what made the
   fact grid look unevenly aligned row to row. */
.visitor-slip .vs-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 10px;
  line-height: 14px;
  padding: 1.5px 0;
}
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 2px solid #0f172a;
  border-top: none;
  padding: 5px 10px;
  font-size: 8.5px;
  line-height: 12px;
  color: #475569;
  font-weight: 700;
  background: #f8fafc;
}
.visitor-slip .vs-reception span:last-child { text-align: right; }
.visitor-slip .vs-foot {
  text-align: center;
  font-size: 7.5px;
  line-height: 10px;
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

/**
 * #19A §2 — the LAST line of defence against a UUID reaching paper.
 *
 * The backend already sends a resolved name and substitutes "System User", so
 * this guard should never fire. It exists because the requirement is absolute
 * ("do not expose raw UUIDs in the printed slip") and a single upstream
 * regression — a renamed API field, an older backend, a hand-edited payload —
 * would otherwise silently put `0804af57-1f03-4d11-ad84-dc34f8829d41` on a
 * document that is kept on file and handed to security. A UUID carries no
 * information for a human reader, so substituting a name can only improve the
 * document; there is no case where printing the id was the better outcome.
 */
const UUID_SHAPE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const actorName = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return SLIP_ACTOR_FALLBACK;
  if (UUID_SHAPE.test(text)) return SLIP_ACTOR_FALLBACK;
  return text;
};

const statusBadge = (status: string): string => {
  const cls =
    status === 'COMPLETED' ? 'vs-badge-done' : status === 'CANCELLED' ? 'vs-badge-cancelled' : 'vs-badge-pending';
  return `<span class="vs-badge ${cls}">${escapeHtml(status)}</span>`;
};

/**
 * Render a server timestamp the way a printed document should show it:
 * `28-Sep-2026 09:45 PM` (#19A §1).
 *
 * WHY THIS EXISTS
 *   The API sends UTC ISO-8601 (`2026-09-28T16:05:01.271Z`). Printing that
 *   verbatim would put a machine timestamp — millisecond precision and a
 *   trailing `Z` — onto a document a person signs by hand, and it would not
 *   agree with the same visitor's Time-In as shown on the ERP screen. The slip
 *   therefore formats it in local time, in the 12-hour form a paper visitor
 *   pass uses, so `16:05` reads as `04:05 PM` on both the screen and the slip.
 *
 *   `hh` (not `HH`) is the 12-hour clock and `A` is the AM/PM designator;
 *   dayjs upper-cases it, giving `AM` / `PM` as required. This is DISPLAY
 *   ONLY: the stored timestamps, the API contract and the database are
 *   untouched, so re-printing still shows the exact same instant.
 *
 *   A value that is missing becomes an em dash, and one that cannot be parsed is
 *   passed through unchanged — a printed slip never says "Invalid Date", and a
 *   stored value is never silently discarded.
 */
function formatStamp(value?: string | null): string {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return '—';
  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY hh:mm A') : text;
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
  // verification the system never performed. #19A §2 — the NAME, not the id.
  const identityNote = confirmed && host.hostIdentityVerified === false
    ? `<div class="vs-row vs-row-full"><span class="vs-label">Confirmed By:</span><span class="vs-val">${escapeHtml(actorName(host.confirmedByName))} <span style="font-weight:600; color:#64748b;">(ERP user — host identity not verified)</span></span></div>`
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
    ${logoUrl ? `<img class="vs-logo" src="${escapeHtml(logoUrl)}" alt="" />` : ''}
    <div class="vs-company">${escapeHtml(SLIP_COMPANY_NAME)}</div>
    <div class="vs-company-sub">${escapeHtml(SLIP_COMPANY_UNIT)} — ${escapeHtml(SLIP_COMPANY_CITY)}</div>
    <div class="vs-title">VISITOR SLIP</div>
    <div class="vs-headline-note">RETAIN THIS SLIP FOR DEPARTURE</div>
  </div>

  <div class="vs-ref-bar">
    <span class="vs-ref-label">VISITOR ID</span>
    <span class="vs-ref">${escapeHtml(orDash(slip.visitorReference))}</span>
    <span class="vs-ref-status">${statusBadge(orDash(slip.status))}</span>
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
    <span>Created By: ${escapeHtml(actorName(slip.createdByName))}</span>
    <span>Created At: ${escapeHtml(formatStamp(slip.createdAt))}</span>
  </div>

  <div class="vs-foot">
    This slip is issued by Security at the gate. Time-In and Time-Out are recorded by the
    system. Host confirmation does not record the visitor's departure.
  </div>
</div>
`;
}
