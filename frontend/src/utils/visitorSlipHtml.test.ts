import dayjs from 'dayjs';
import { renderVisitorSlipHtml as buildSlipHtml, escapeHtml, type VisitorSlipData } from './visitorSlipHtml';
import { printVisitorSlipDocument } from './printTemplates';

/**
 * Prompt #19 §7 / §8 / §13 / §26 / §30 / §33 / §34 — the printed document
 * contract. These tests hold the layout itself to the requirements, so a later
 * edit to the CSS cannot quietly shrink the signature box or drop the page rules.
 */

const SLIP: VisitorSlipData = {
  visitorReference: 'VIS-2026-000042',
  companyName: 'PAKISTAN WIRE INDUSTRIES (PVT) LTD.',
  visitorName: 'Muhammad Test',
  cnic: '12345-*******-1',
  mobile: '0300-1234567',
  visitorCompany: 'PakWiz Trading',
  hostName: 'Muhammad Zeeshan',
  hostDepartment: 'Cutting & Packing',
  division: { code: 'DIV-CCD', name: 'Control Cable Division' },
  location: { code: 'GATE-01', name: 'Main Gate' },
  timeIn: '2026-09-30 10:30',
  timeOut: null,
  status: 'PENDING',
  hostConfirmation: {
    confirmed: false,
    hostIdentityVerified: false,
  },
  createdBy: 'u1',
  createdAt: '2026-09-30 10:30',
};

const CONFIRMED: VisitorSlipData = {
  ...SLIP,
  timeOut: '2026-09-30 13:40',
  status: 'COMPLETED',
  hostConfirmation: {
    confirmed: true,
    confirmedAt: '2026-09-30 11:05',
    confirmedBy: 'u1',
    signatureCapturedAt: '2026-09-30 11:05',
    signatureCapturedBy: 'u1',
    hostIdentityVerified: false,
  },
};

/** The confirmed fixture's signature capture time, read safely. */
const capturedAt = (): string | null | undefined =>
  CONFIRMED.hostConfirmation?.signatureCapturedAt;

/** Parse the markup the way a browser would, so assertions read like a viewer. */
function asDom(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * What a timestamp SHOULD read on the slip, computed rather than hard-coded.
 *
 * The slip formats times as `DD-MMM-YYYY HH:mm` in local time, so a test that
 * hard-codes a wall-clock string would fail in any timezone that is not UTC.
 * Mirroring the slip's own format here keeps the assertion about the *rule*
 * (printable, human-readable) rather than about the machine's offset.
 */
function asDisplayed(iso?: string | null): string {
  if (!iso) return '—';
  const parsed = dayjs(iso);
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY HH:mm') : iso;
}

describe('escapeHtml', () => {
  it('encodes every character that could break out of text or an attribute', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;',
    );
  });

  it('renders null and undefined as an empty string, never "null"', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('renderVisitorSlipHtml', () => {
  it('prints every fact the visitor slip is required to carry', () => {
    const doc = asDom(buildSlipHtml(SLIP, {}, '/logo.png'));
    const text = doc.body.textContent || '';

    for (const expected of [
      'PAKISTAN WIRE INDUSTRIES (PVT) LTD.',
      'VISITOR SLIP',
      'VIS-2026-000042',
      'Muhammad Test',
      '12345-*******-1',
      '0300-1234567',
      'PakWiz Trading',
      'Muhammad Zeeshan',
      'Cutting & Packing',
      'Control Cable Division',
      'Main Gate',
      asDisplayed(SLIP.timeIn),
      'PENDING',
      'u1',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('shows "Pending" for a Time-Out that does not exist yet, never a blank', () => {
    const text = asDom(buildSlipHtml(SLIP)).body.textContent || '';
    expect(text).toContain('Time-Out');
    expect(text).toContain('Pending');
    expect(text).not.toContain(asDisplayed(CONFIRMED.timeOut));
  });

  it('shows the real Time-In and Time-Out for a completed visit', () => {
    const text = asDom(buildSlipHtml(CONFIRMED)).body.textContent || '';
    expect(text).toContain(asDisplayed(CONFIRMED.timeIn));
    expect(text).toContain(asDisplayed(CONFIRMED.timeOut));
    expect(text).toContain('COMPLETED');
    expect(text).toContain('CONFIRMED');
    expect(text).not.toContain('Pending');
  });

  it('prints human-readable times, never a raw ISO timestamp with a Z', () => {
    // A slip is signed by hand; `2026-09-28T16:05:01.271Z` on paper is a machine
    // artefact, and would not match the Time-In the same row shows on screen.
    const iso = '2026-09-28T16:05:01.271Z';
    const text = asDom(
      buildSlipHtml({ ...SLIP, timeIn: iso, createdAt: iso, hostConfirmation: { ...SLIP.hostConfirmation, confirmed: true, confirmedAt: iso, signatureCapturedAt: iso } }, { signatureDataUrl: 'data:image/png;base64,AAAA' }),
    ).body.textContent || '';

    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(text).not.toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    // `asDisplayed` mirrors the slip's own formatting (dayjs DD-MMM-YYYY HH:mm),
    // computed in the test's timezone rather than hard-coded.
    expect(text).toContain(asDisplayed(iso));
  });

  it('never prints "Invalid Date" when a stored timestamp cannot be parsed', () => {
    // A stored value is never silently discarded and never rendered as a bug.
    const text = asDom(
      buildSlipHtml({ ...SLIP, timeIn: 'not a date', createdAt: null }),
    ).body.textContent || '';
    expect(text).not.toMatch(/Invalid/i);
    expect(text).toContain('not a date');
    expect(text).toContain('Created At: —');
  });

  // §13 — the whole point of the physical box.
  it('always includes a physical signature area large enough to sign by hand', () => {
    for (const slip of [SLIP, CONFIRMED]) {
      const doc = asDom(buildSlipHtml(slip));
      const text = doc.body.textContent || '';
      // A ruled line for the signature itself, plus name, date and reception use.
      expect(text).toContain('HOST CONFIRMATION');
      expect(text).toContain('Host Name');
      expect(text).toContain('Date / Time');
      expect(text).toContain('Security / Reception Use');
      // At least four ruled lines remain for handwriting.
      expect(doc.querySelectorAll('.vs-sign-rule').length).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps a BLANK "Host Signature" rule even when a digital signature is printed', () => {
    // §13 — the physical area is mandatory, so a captured digital signature is an
    // ADDITION to the slip, never a replacement for the handwritten blank. This
    // is the case that regressed once: the image took the signature slot and the
    // printed slip was left with no line for the host to actually sign.
    const with_ = asDom(
      buildSlipHtml(CONFIRMED, { signatureDataUrl: 'data:image/png;base64,AAAA' }),
    );
    expect(with_.querySelector('img.vs-sig-image')).not.toBeNull();

    const blanks = Array.from(with_.querySelectorAll('.vs-sign-rule')).filter((rule) => {
      const cap = (rule.nextElementSibling?.textContent || '').trim();
      return cap === 'Host Signature';
    });
    expect(blanks.length).toBe(1);
    expect(blanks[0].classList.contains('vs-sign-rule-main')).toBe(true);
    // The digital copy is labelled separately, so the two are never confused.
    expect(with_.body.textContent).toContain(
      `Host Signature — digital, captured ${asDisplayed(capturedAt())}`,
    );
  });

  it('keeps the signature rules physically tall enough for handwriting', () => {
    const css = asDom(buildSlipHtml(SLIP)).querySelector('style')?.textContent || '';
    // 48px ≈ 12.7mm of writable height on the physical signature line — a real
    // signature needs roughly 10-14mm. The supporting blanks are 34px ≈ 9mm and
    // reception use 26px ≈ 7mm, so nothing is a hairline.
    expect(css).toMatch(/\.vs-sign-rule\s*\{[^}]*height:\s*34px/);
    expect(css).toMatch(/\.vs-sign-rule-main\s*\{[^}]*height:\s*48px/);
    expect(css).toMatch(/\.vs-sign-rule-sm\s*\{[^}]*height:\s*26px/);
    expect(css).toMatch(/\.vs-sig-image\s*\{[^}]*max-height:\s*52px/);
  });

  it('prints the captured digital signature only when one was supplied', () => {
    const without = asDom(buildSlipHtml(CONFIRMED));
    expect(without.querySelector('img.vs-sig-image')).toBeNull();

    const with_ = asDom(
      buildSlipHtml(CONFIRMED, { signatureDataUrl: 'data:image/png;base64,AAAA' }),
    );
    const signature = with_.querySelector('img.vs-sig-image') as HTMLImageElement;
    expect(signature.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(with_.body.textContent).toContain(
      `captured ${asDisplayed(capturedAt())}`,
    );
  });

  // §6 / §26 — a missing image degrades, it never blocks.
  it('degrades to a photo placeholder when no image could be loaded', () => {
    const doc = asDom(buildSlipHtml(SLIP));
    expect(doc.querySelector('img.vs-photo')).toBeNull();
    expect(doc.querySelector('.vs-photo-placeholder')).not.toBeNull();
    // The document is otherwise complete.
    expect(doc.querySelectorAll('.vs-row').length).toBeGreaterThan(8);
  });

  it('uses a fixed, contain-fitted box so a photo is never stretched', () => {
    const css = asDom(buildSlipHtml(SLIP)).querySelector('style')?.textContent || '';
    const photoRule = css.slice(css.indexOf('.visitor-slip .vs-photo {'));
    expect(photoRule).toMatch(/width:\s*78px/);
    expect(photoRule).toMatch(/height:\s*100px/);
    expect(photoRule).toMatch(/object-fit:\s*contain/);
  });

  // §17 — the document never implies an identity check the system did not do.
  it('states that the host identity was not verified, and who actually confirmed', () => {
    const text = asDom(buildSlipHtml(CONFIRMED)).body.textContent || '';
    expect(text).toContain('ERP user — host identity not verified');
  });

  it('never claims a verification on an unconfirmed slip', () => {
    const text = asDom(buildSlipHtml(SLIP)).body.textContent || '';
    expect(text).not.toContain('host identity not verified');
    expect(text).toContain('PENDING');
  });

  it('falls back to a dash for every missing value, so the grid never collapses', () => {
    const text = asDom(
      buildSlipHtml({
        visitorReference: null,
        companyName: null,
        visitorName: null,
        cnic: null,
        mobile: null,
        visitorCompany: null,
        hostName: null,
        hostDepartment: null,
        division: null,
        location: null,
        timeIn: null,
        timeOut: null,
        status: null,
        createdBy: null,
        createdAt: null,
      }),
    ).body.textContent || '';
    expect(text).toContain('—');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    // The company header still names a company rather than rendering nothing
    // (the CSS uppercases it for print, so the markup keeps the natural case).
    expect(text).toContain('Pakistan Wire Industries (Pvt) Ltd.');
  });

  // §30 — untrusted visitor text reaching a print surface.
  it('escapes hostile visitor text instead of injecting markup', () => {
    const markup = buildSlipHtml({
      ...SLIP,
      visitorName: '<img src=x onerror="alert(1)">',
      visitorCompany: '"><script>alert(2)</script>',
    });
    const doc = asDom(markup);
    expect(doc.querySelector('img[src="x"]')).toBeNull();
    expect(doc.querySelector('script')).toBeNull();
    // Only the logo and the real photo may be <img> elements.
    const images = Array.from(doc.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(images.every((src) => src === '/logo.png')).toBe(true);
    expect(markup).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('escapes an injected data URL in an asset, so it cannot break out of the attribute', () => {
    const markup = buildSlipHtml(SLIP, {
      photoDataUrl: 'x" onerror="alert(1)',
    });
    const doc = asDom(markup);
    const image = doc.querySelector('img.vs-photo') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('x" onerror="alert(1)');
    expect(image.getAttribute('onerror')).toBeNull();
  });

  // §8 / §33 — page rules that keep the slip on one readable A4 page.
  it('declares A4 print rules that never split the slip or its signature block', () => {
    const css = asDom(buildSlipHtml(SLIP)).querySelector('style')?.textContent || '';
    expect(css).toContain('@media print');
    expect(css).toMatch(/break-inside:\s*avoid/);
    expect(css).toMatch(/page-break-inside:\s*avoid/);
    // The slip is bounded to the printable width of A4 (210mm − margins).
    expect(css).toMatch(/max-width:\s*190mm/);
  });

  it('includes the logo only when the caller has one', () => {
    expect(asDom(buildSlipHtml(SLIP)).querySelector('img.vs-logo')).toBeNull();
    expect(asDom(buildSlipHtml(SLIP, {}, '/logo.png')).querySelector('img.vs-logo')).not.toBeNull();
  });
});

describe('printVisitorSlipDocument', () => {
  afterEach(() => {
    document.getElementById('pwi-print-frame')?.remove();
  });

  function printFrame(): HTMLIFrameElement {
    const frame = document.getElementById('pwi-print-frame') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    return frame;
  }

  // The whole architectural promise: the slip reuses the EXISTING print
  // pipeline instead of introducing a second printing system.
  it('reuses the existing hidden-iframe A4 print pipeline', () => {
    printVisitorSlipDocument(SLIP);

    const frame = printFrame();
    // Off-screen: the print job can never show ERP chrome.
    expect(frame.style.left).toBe('-10000px');
    expect(frame.style.width).toBe('210mm');
    expect(frame.style.height).toBe('297mm');

    const doc = frame.contentDocument as Document;
    expect(doc.title).toBe('Visitor Slip - VIS-2026-000042');
    expect(doc.querySelector('.pwi-print-container')).not.toBeNull();
    const style = doc.querySelector('style')?.textContent || '';
    expect(style).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/);
    // §8 — the print document contains the slip and nothing else.
    expect(doc.querySelectorAll('.visitor-slip')).toHaveLength(1);
    expect(doc.body.textContent).not.toContain('Reload');
  });

  it('writes exactly the markup the on-screen preview renders', () => {
    printVisitorSlipDocument(SLIP);
    const doc = printFrame().contentDocument as Document;
    const printed = doc.querySelector('.visitor-slip') as HTMLElement;

    const expected = asDom(buildSlipHtml(SLIP, {}, `${window.location.origin}/logo.png`))
      .querySelector('.visitor-slip') as HTMLElement;
    // `print()` drops no structure: the two renderings are byte-identical once
    // the caller-supplied logo URL is the same, so the preview cannot drift.
    expect(printed.innerHTML).toBe(expected.innerHTML);
  });

  it('prints a completed visit with its real Time-Out', () => {
    printVisitorSlipDocument(CONFIRMED, { signatureDataUrl: 'data:image/png;base64,AAAA' });
    const text = (printFrame().contentDocument as Document).body.textContent || '';
    expect(text).toContain(asDisplayed(CONFIRMED.timeOut));
    expect(text).toContain('COMPLETED');
    expect(text).toContain('Host Signature');
  });

  it('prints a slip with no photo at all, rather than failing', () => {
    expect(() => printVisitorSlipDocument(SLIP)).not.toThrow();
    const doc = printFrame().contentDocument as Document;
    expect(doc.querySelector('.vs-photo-placeholder')).not.toBeNull();
  });

  it('never builds a URL to a private storage path', () => {
    const withPaths = {
      ...SLIP,
      photoPath: 'visitors/2026/09/secret-photo.jpg',
      signaturePath: 'visitors/2026/09/secret-signature.png',
    } as VisitorSlipData;
    printVisitorSlipDocument(withPaths, {
      photoDataUrl: 'data:image/png;base64,AAAA',
      signatureDataUrl: 'data:image/png;base64,BBBB',
    });
    const doc = printFrame().contentDocument as Document;
    const html = doc.documentElement.innerHTML;
    expect(html).not.toContain('secret-photo.jpg');
    expect(html).not.toContain('secret-signature.png');
  });

  it('replaces a previous print frame instead of stacking documents', () => {
    printVisitorSlipDocument(SLIP);
    printVisitorSlipDocument(CONFIRMED);
    expect(document.querySelectorAll('#pwi-print-frame')).toHaveLength(1);
    const doc = printFrame().contentDocument as Document;
    expect(doc.querySelectorAll('.visitor-slip')).toHaveLength(1);
    expect(doc.body.textContent).toContain('COMPLETED');
  });

  it('does nothing at all without a slip', () => {
    printVisitorSlipDocument(null as unknown as VisitorSlipData);
    expect(document.getElementById('pwi-print-frame')).toBeNull();
  });
});
