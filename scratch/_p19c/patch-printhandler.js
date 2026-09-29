const fs = require('fs');
const p = 'frontend/src/pages/visitor/VisitorManagement.tsx';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

// Locate the print handler by its anchors rather than by a hard-coded number.
const start = lines.findIndex((l) => l.includes('── Print handler'));
if (start < 0) throw new Error('print handler marker not found');
// The handler ends at the first line that is exactly "  };" after the start.
let end = -1;
for (let i = start; i < lines.length; i++) {
  if (lines[i] === '  };') { end = i; break; }
}
if (end < 0) throw new Error('handler end not found');

console.log('replacing lines ' + (start + 1) + '..' + (end + 1));
console.log('--- first line: ' + lines[start]);
console.log('--- last  line: ' + lines[end]);

const replacement = `  // ── Print handler ──────────────────────────────────────────────────────
  /**
   * Print the Visitor REGISTER (the multi-column gate list).
   *
   * This is a different document from the individual Visitor Slip, on purpose.
   * The slip is a single A4 portrait sheet; the register is thirteen columns of
   * tabular data, so it renders and prints A4 **landscape** in its own document
   * built by \`visitorRegisterPrint\`. Nothing here touches the slip, and nothing
   * in the slip's pipeline reaches here.
   *
   * The chosen range is now actually APPLIED. The dialog has always offered
   * "Today Only" and "Full Month", and the old handler used the selection for
   * nothing but the caption — so a register printed for 29-Sep-2026 could carry
   * visitors from any date the current filter happened to hold, under a header
   * that said otherwise. The rows are already loaded, so this filters what the
   * screen is already showing: it issues no new request and widens no access.
   * When the range genuinely holds nothing, the document says so rather than
   * printing a blank sheet.
   */
  const handlePrint = (mode: 'today' | 'month', date: dayjs.Dayjs) => {
    setPrintModalOpen(false);
    const rangeLabel =
      mode === 'today' ? \`Date: \${date.format('DD-MMM-YYYY')}\` : \`Month: \${date.format('MMMM YYYY')}\`;
    const printRows =
      mode === 'today'
        ? rows.filter((r) => dayjs(r.timeIn).isSame(date, 'day'))
        : rows.filter((r) => dayjs(r.timeIn).isSame(date, 'month'));
    printVisitorRegisterDocument(renderVisitorRegisterHtml({ rows: printRows, rangeLabel }));
  };`;

lines.splice(start, end - start + 1, replacement);
fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('done');
