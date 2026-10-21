import { readFileSync, writeFileSync } from 'node:fs';

const pairs = [
  ['â€”', '\u2014'],                       // em dash
  ['â\u009D™â\u009D™', '\u2759\u2759'],   // pause glyph (x2)
  ['Ã—', '\u00D7'],                       // multiplication sign
  ['â¤“', '\u2913'],                       // download glyph
  ['â–¶', '\u25B6'],                       // play glyph
];

let s = readFileSync('index.html', 'utf8');
for (const [bad, good] of pairs) s = s.split(bad).join(good);
writeFileSync('index.html', s, { encoding: 'utf8' });

const rest = (s.match(/[^\x00-\x7F]+/g) || []);
console.log('remaining non-ascii:', JSON.stringify([...new Set(rest)]));
console.log('pause ok:', s.includes('\u2759\u2759 pause'));
console.log('capture ok:', s.includes('\u2913 capture frame'));
console.log('4k option ok:', s.includes('3840\u00D72160 (4K)'));
console.log('em dash ok:', s.includes('motion study'));
console.log('play ok:', s.includes('\u25B6 play'));
