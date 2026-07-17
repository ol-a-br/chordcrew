/**
 * render-debug.mjs
 *
 * Renders a ChordPro file to a standalone HTML page for visual debugging.
 * The output mirrors exactly what SongRenderer.tsx does in the app:
 *   1. preprocessChordPro()  — same space-normalisation + directive transforms
 *   2. chordsheetjs HtmlDivFormatter — same parser/formatter
 *   3. DOM post-processing   — same empty-chord merging + word-group wrapping
 *
 * Usage:
 *   node scripts/render-debug.mjs [input.chordpro.txt] [output.html]
 *
 * Defaults:
 *   input  → data/example-song.chordpro.txt
 *   output → /tmp/chordcrew-debug.html
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { ChordProParser, HtmlDivFormatter } = require(resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/chordsheetjs/lib/index.js'))

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const inputPath  = process.argv[2] ?? resolve(ROOT, 'data/example-song.chordpro.txt')
const outputPath = process.argv[3] ?? '/tmp/chordcrew-debug.html'
const colCount   = parseInt(process.argv[4] ?? '4', 10)    // CSS column-count (default 4)
const fontScale  = parseFloat(process.argv[5] ?? '1.5')    // matches app Settings font slider
const semitones  = parseInt(process.argv[6] ?? '0', 10)    // transpose offset (default 0)

// ── 1. Preprocess (mirrors src/utils/chordpro.ts preprocessChordPro) ─────────

function preprocessChordPro(content) {
  // Normalize consecutive spaces in lyrics lines (avoids chordsheetjs comma bug)
  const lines = content.split('\n')
  let inLiteral = false
  const normalizedLines = lines.map(line => {
    if (/\{(?:start_of_tab|sot|start_of_grid|sog)\b/i.test(line)) { inLiteral = true; return line }
    if (/\{(?:end_of_tab|eot|end_of_grid|eog)\b/i.test(line)) { inLiteral = false; return line }
    if (inLiteral) return line
    if (line.trimStart().startsWith('{')) return line
    return line.replace(/  +/g, ' ')
  })
  content = normalizedLines.join('\n')

  return content
    .replace(/\{sop\s*:\s*([^}]+)\}/gi, '{start_of_verse: $1}')
    .replace(/\{start_of_part\s*:\s*([^}]+)\}/gi, '{start_of_verse: $1}')
    .replace(/\{eop\b[^}]*\}/gi, '{end_of_verse}')
    .replace(/\{end_of_part\b[^}]*\}/gi, '{end_of_verse}')
    .replace(/\{start_of_verse\s*\}/gi, '{start_of_verse: Verse}')
    .replace(/\{start_of_bridge\s*\}/gi, '{start_of_bridge: Bridge}')
    .replace(/\{(start_of_chorus)\s*\}/gi, '{$1: Chorus}')
    .replace(/\{(soc)\s*\}/gi, '{start_of_chorus: Chorus}')
    .replace(/\{soc\s*:\s*([^}]+)\}/gi, '{start_of_chorus: $1}')
    .replace(/\{eoc\b[^}]*\}/gi, '{end_of_chorus}')
    .replace(/\{inline\s*:\s*([^}]+)\}/gi, (_m, c) => {
      const marked = c.trim().replace(/\[([^\]]*)\]/g, '«$1»')
      return `{comment: ${marked}}`
    })
    .replace(/\{repeat\s*:\s*([^}]+)\}/gi, (_m, c) => {
      const s = c.trim().replace(/\s+/g, ' ')
      const xm = s.match(/^(.*?)\s+(\d+)x\s*$/i)
      if (xm) return `{comment: ↺ ${xm[1].trim()} ×${xm[2]}}`
      return `{comment: ↺ ${s}}`
    })
    .replace(/\{new_song[^}]*\}/gi, '')
}

// ── 2. Transpose a single chord name (mirrors transposeKey in chordpro.ts) ───

function transposeChord(chord, n) {
  if (!chord || n === 0) return chord
  try {
    const mini = new ChordProParser().parse(`[${chord}]\n`)
    const html  = new HtmlDivFormatter().format(mini.transpose(n))
    const m = html.match(/<div class="chord">([^<]+)<\/div>/)
    return m?.[1]?.trim() ?? chord
  } catch { return chord }
}

// Pre-transpose «ChordName» markers in inline comments so that chordsheetjs
// sees the already-transposed names (it does not transpose comment text).
function transposeInlineMarkers(content, n) {
  if (n === 0) return content
  return content.replace(/«([^»]*)»/g, (_, chord) => {
    let text = chord
    let optional = false
    if (text.startsWith('(') && text.endsWith(')')) {
      text = text.slice(1, -1).trim()
      optional = true
    }
    const transposed = transposeChord(text, n)
    return optional ? `«(${transposed})»` : `«${transposed}»`
  })
}

// ── 3. Parse + render via chordsheetjs ───────────────────────────────────────

const rawContent = readFileSync(inputPath, 'utf8')
const processed  = transposeInlineMarkers(preprocessChordPro(rawContent), semitones)
const parser     = new ChordProParser()
const song       = semitones !== 0 ? parser.parse(processed).transpose(semitones) : parser.parse(processed)
const rawHtml    = new HtmlDivFormatter().format(song)

// ── 4. Post-processing JS (runs in the browser, same logic as SongRenderer) ──
//    Written as a plain string so it can be embedded verbatim in the <script>.
//    Keep this in sync with src/components/viewer/SongRenderer.tsx useEffect.

const postProcessingJS = `
// ── isKnownChord (mirrors src/utils/chordpro.ts) ────────────────────────────
const ROOTS = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];
const QUALITIES = [
  '','m','maj7','m7','7','sus','sus2','sus4','dim','aug',
  'add9','add2','add4','add11','6','9','11','13',
  'maj9','maj11','maj13','m6','m9','m11','m13',
  'mmaj7','dim7','m7b5','7sus4','7sus2','5','2','4',
];
function isKnownChord(chord) {
  const base = chord.split('/')[0];
  for (const r of ROOTS) {
    if (!base.startsWith(r)) continue;
    const quality = base.slice(r.length);
    const normalized = (quality.startsWith('(') && quality.endsWith(')'))
      ? quality.slice(1, -1) : quality;
    if (QUALITIES.includes(normalized)) return true;
    if (/^\\d{1,2}$/.test(normalized)) return true;
    if (/^\\d+(sus|add|maj|min|m)\\d*$/.test(normalized)) return true;
  }
  return false;
}

// ── splitChordName ───────────────────────────────────────────────────────────
function splitChordName(chord) {
  const slashIdx = chord.indexOf('/');
  const bass = slashIdx !== -1 ? chord.slice(slashIdx) : '';
  const main = slashIdx !== -1 ? chord.slice(0, slashIdx) : chord;
  const m = main.match(/^([A-G][b#]?)(.*)\$/);
  if (!m) return { root: chord, quality: '', bass: '' };
  let quality = m[2];
  if (quality.startsWith('(') && quality.endsWith(')')) quality = quality.slice(1, -1);
  return { root: m[1], quality, bass };
}

// ── CHORUS_TERMS ─────────────────────────────────────────────────────────────
const CHORUS_TERMS = ['chorus','refrän','refrain','ref','refr','refrein'];
function isChorusLabel(text) {
  const lower = text.toLowerCase().trim();
  return CHORUS_TERMS.some(t => lower === t || lower.startsWith(t+' ') || lower.startsWith(t+'-'));
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.chordpro-output');
  if (!container) return;

  // ── Section badge tracking ─────────────────────────────────────────────────
  const nameToLetter = new Map();
  const letterCount  = new Map();
  let nextIdx = 0;

  function assignBadge(sectionName) {
    const key = sectionName.toLowerCase().trim();
    if (nameToLetter.has(key)) {
      const letter = nameToLetter.get(key);
      const count = (letterCount.get(letter) ?? 0) + 1;
      letterCount.set(letter, count);
      return { letter, count };
    }
    nextIdx++;
    const letter = String.fromCharCode(64 + nextIdx);
    nameToLetter.set(key, letter);
    letterCount.set(letter, 1);
    return { letter, count: 1 };
  }

  function createBadge(letter, count) {
    const badge = document.createElement('span');
    badge.className = 'section-badge';
    badge.textContent = count === 1 ? letter : letter + count;
    return badge;
  }

  function injectBadge(anchor, sectionName) {
    const { letter, count } = assignBadge(sectionName);
    anchor.prepend(createBadge(letter, count));
  }

  // ── Pass 1: section headers + chorus marking ───────────────────────────────
  container.querySelectorAll('.paragraph').forEach(para => {
    const labelEls = para.querySelectorAll('h3.label');
    if (labelEls.length > 0) {
      labelEls.forEach(labelEl => {
        const name = labelEl.textContent ?? '';
        injectBadge(labelEl, name);
        if (isChorusLabel(name)) {
          const labelPara = labelEl.closest('.paragraph');
          if (!labelPara?.classList.contains('chorus')) {
            const labelRow = labelEl.closest('.row');
            if (labelRow) {
              labelRow.classList.add('chorus-section');
              let sib = labelRow.nextElementSibling;
              while (sib?.classList.contains('row')) {
                if (sib.querySelector('h3.label')) break;
                sib.classList.add('chorus-section');
                sib = sib.nextElementSibling;
              }
            }
          }
        }
      });
      return;
    }

    const firstRow = para.querySelector(':scope > .row');
    if (!firstRow) return;
    const cols = Array.from(firstRow.querySelectorAll(':scope > .column'));
    if (cols.length === 0) return;
    const chordEl  = cols[0].querySelector('.chord');
    const lyricsEl = cols[0].querySelector('.lyrics');
    if (!chordEl || !lyricsEl) return;
    const chordText = chordEl.textContent?.trim() ?? '';
    if (!chordText || lyricsEl.textContent?.trim() !== '') return;
    if (isKnownChord(chordText)) return;

    firstRow.classList.add('section-header-row');
    const { letter, count } = assignBadge(chordText);
    firstRow.insertBefore(createBadge(letter, count), firstRow.firstChild);

    if (cols.length > 1) {
      const newRow = document.createElement('div');
      newRow.className = 'row';
      cols.slice(1).forEach(col => newRow.appendChild(col));
      firstRow.after(newRow);
    }
    if (isChorusLabel(chordText)) para.classList.add('chorus-section');
  });

  // ── Chord processing: optional, quality split, bass ───────────────────────
  container.querySelectorAll('.chord').forEach(el => {
    if (el.closest('.section-header-row')) return;
    if (el.querySelector('span, sup')) return;
    let text = el.textContent?.trim() ?? '';
    if (!text) return;
    if (text.startsWith('(') && text.endsWith(')')) {
      text = text.slice(1, -1).trim();
      el.textContent = text;
      el.classList.add('chord-optional');
    }
    if (!isKnownChord(text)) {
      el.classList.add('chord-annotation');
      return;
    }
    const { root, quality, bass } = splitChordName(text);
    if (!quality && !bass) return;
    el.textContent = '';
    const rootSpan = document.createElement('span');
    rootSpan.textContent = root;
    el.appendChild(rootSpan);
    if (quality) {
      const qSpan = document.createElement('span');
      qSpan.className = 'chord-quality';
      qSpan.textContent = quality;
      el.appendChild(qSpan);
    }
    if (bass) {
      const bSpan = document.createElement('span');
      bSpan.className = 'chord-bass';
      bSpan.textContent = bass;
      el.appendChild(bSpan);
    }
  });

  // ── Merge empty-chord columns into predecessor ─────────────────────────────
  container.querySelectorAll('.row').forEach(row => {
    const cols = Array.from(row.querySelectorAll(':scope > .column'));
    for (let i = cols.length - 1; i >= 1; i--) {
      const chordEl = cols[i].querySelector('.chord');
      if (chordEl && chordEl.textContent?.trim() === '') {
        const prevLyricsEl = cols[i-1].querySelector('.lyrics');
        const thisLyricsEl = cols[i].querySelector('.lyrics');
        if (prevLyricsEl && thisLyricsEl) {
          prevLyricsEl.textContent = (prevLyricsEl.textContent ?? '') + (thisLyricsEl.textContent ?? '');
        }
        cols[i].remove();
      }
    }
  });

  // ── Word-boundary repair: reattach word-prefixes to the chord column ─────────
  // After empty-chord merging, a mid-word chord like Me[F]nschen still produces:
  //   col_i  = (chord="" | lyrics="Wo die Me")
  //   col_i+1= (chord=F  | lyrics="nschen zu Ihm flehn...")
  // Wrapping these side-by-side (the old word-group approach) halves available
  // width, creating ugly sub-columns.  Instead, we move the word-start ("Me")
  // from col_i's lyrics into col_i+1's lyrics so "Menschen" is a single word
  // in one column.  col_i gets "Wo die " (ends with space) and can wrap freely.
  container.querySelectorAll('.row').forEach(row => {
    let i = 0;
    while (true) {
      const cols = Array.from(row.querySelectorAll(':scope > .column'));
      if (i >= cols.length - 1) break;

      const prevLyricsEl = cols[i].querySelector('.lyrics');
      const nextLyricsEl = cols[i+1].querySelector('.lyrics');
      if (!prevLyricsEl || !nextLyricsEl) { i++; continue; }

      const prevLyrics = prevLyricsEl.textContent ?? '';
      const nextLyrics = nextLyricsEl.textContent ?? '';

      const isMidWord = prevLyrics.length > 0
        && !prevLyrics.endsWith(' ')
        && !nextLyrics.startsWith(' ')
        && nextLyrics.length > 0;

      if (isMidWord) {
        const lastSpaceIdx = prevLyrics.lastIndexOf(' ');
        const wordStart = lastSpaceIdx === -1 ? prevLyrics : prevLyrics.slice(lastSpaceIdx + 1);
        const prefix    = lastSpaceIdx === -1 ? ''         : prevLyrics.slice(0, lastSpaceIdx + 1);

        nextLyricsEl.textContent = wordStart + nextLyrics;
        prevLyricsEl.textContent = prefix;

        // Remove col_i if it now has no chord AND no lyrics (empty placeholder)
        const prevChordEl = cols[i].querySelector('.chord');
        const prevChordEmpty = !prevChordEl || prevChordEl.textContent?.trim() === '';
        if (!prefix && prevChordEmpty) {
          cols[i].remove();
          // Don't increment i — same position now points to the next column
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
  });

  // ── Convert .column elements to native <ruby> for inline text flow ──────────
  container.querySelectorAll('.row').forEach(row => {
    if (row.classList.contains('section-header-row')) return;
    Array.from(row.querySelectorAll(':scope > .column')).forEach(col => {
      const chordEl  = col.querySelector('.chord');
      const lyricsEl = col.querySelector('.lyrics');
      const ruby = document.createElement('ruby');
      ruby.appendChild(document.createTextNode(lyricsEl?.textContent ?? ''));
      const rt = document.createElement('rt');
      rt.className = 'chord';
      if (chordEl) {
        chordEl.classList.forEach(cls => { if (cls !== 'chord') rt.classList.add(cls); });
        rt.innerHTML = chordEl.innerHTML;
      }
      ruby.appendChild(rt);
      col.replaceWith(ruby);
    });
  });

  // ── Pass 2: repeat badge ↺ comments ───────────────────────────────────────
  container.querySelectorAll('.comment').forEach(commentEl => {
    const text = commentEl.textContent?.trim() ?? '';
    if (!text.startsWith('↺')) return;
    const sectionName = text.replace(/^↺\\s*/, '').replace(/\\s+×\\d+\\s*\$/, '').trim();
    if (!sectionName) return;
    let key = sectionName.toLowerCase().trim();
    if (!nameToLetter.has(key) && isChorusLabel(sectionName)) {
      for (const term of CHORUS_TERMS) {
        if (nameToLetter.has(term)) { key = term; break; }
      }
    }
    if (!nameToLetter.has(key)) return;
    const letter = nameToLetter.get(key);
    const count = (letterCount.get(letter) ?? 1) + 1;
    letterCount.set(letter, count);
    commentEl.prepend(createBadge(letter, count));
  });

  // ── Inline chord comments (from {inline:} directive) ─────────────────────
  container.querySelectorAll('.comment').forEach(commentEl => {
    const text = commentEl.textContent ?? '';
    if (!text.includes('«')) return;
    commentEl.classList.add('inline-chord-comment');
    const parts = text.split(/«([^»]*)»/);
    commentEl.textContent = '';
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const span = document.createElement('span');
        span.className = 'chord inline-chord';
        span.textContent = part;
        commentEl.appendChild(span);
      } else {
        commentEl.appendChild(document.createTextNode(part));
      }
    });
  });
});
`

// ── 5. Assemble standalone HTML ───────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChordCrew Debug — ${inputPath.split('/').pop()}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* ── Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-family: 'Outfit', sans-serif; background: #0d1117; color: #e6edf3; }
    /* Match the app's performance page padding — full width, no fixed container */
    body { min-height: 100vh; padding: 1rem 1.5rem; }

    .debug-info {
      margin-top: 1.5rem;
      padding-top: 0.75rem;
      border-top: 1px solid #30363d;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #8b949e;
    }
    .debug-info h2 {
      color: #e6edf3;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
      font-family: 'Outfit', sans-serif;
    }
    .debug-info p { margin-bottom: 0.25rem; }
    .debug-info .key { color: #f59e0b; }

    /* ── ChordPro renderer (mirrors src/index.css .chordpro-output) ── */
    .chordpro-output {
      font-family: 'Barlow Condensed', sans-serif;
      line-height: 1.6;
      color: #e6edf3;
      font-size: ${fontScale}rem;
    }
    .chordpro-columns-1 { column-count: 1; }
    .chordpro-columns-2 { column-count: 2; column-gap: 2.5rem; column-rule: 1px solid rgba(255,255,255,0.06); }
    .chordpro-columns-3 { column-count: 3; column-gap: 2rem;   column-rule: 1px solid rgba(255,255,255,0.06); }
    .chordpro-columns-4 { column-count: 4; column-gap: 1.5rem; column-rule: 1px solid rgba(255,255,255,0.06); }

    .chordpro-output .paragraph {
      break-inside: avoid;
      margin-bottom: 1.25rem;
    }

    .chordpro-output .label {
      color: #38bdf8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.875em;
      font-family: 'Barlow Condensed', sans-serif;
      margin: 0.75rem 0 0.2rem 0;
      line-height: 1.4;
    }
    .chordpro-output .paragraph:first-child .label:first-of-type {
      margin-top: 0;
    }

    .chordpro-output .section-header-row {
      min-height: unset !important;
      align-items: baseline;
      margin: 0.75rem 0 0.2rem 0;
    }
    .chordpro-output .section-header-row .chord {
      color: #38bdf8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 0.9em;
      line-height: 1.4;
    }

    .chordpro-output .section-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.5em;
      height: 1.5em;
      padding: 0 0.2em;
      border: 1.5px solid #484f58;
      border-radius: 2px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85em;
      font-weight: 700;
      color: #8b949e;
      margin-right: 0.5em;
      vertical-align: baseline;
      flex-shrink: 0;
      line-height: 1;
    }

    .chordpro-output .row {
      display: block;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .chordpro-output ruby {
      ruby-align: start;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    /* Section header rows: keep flex layout (section name in .chord, no lyrics) */
    .chordpro-output .section-header-row {
      display: flex;
      align-items: baseline;
    }
    .chordpro-output .section-header-row .column {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
    }

    /* Fallback: .column only used in section-header-rows after JS conversion */
    .chordpro-output .column {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .chordpro-output h1 {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 1.25em;
      font-weight: 700;
      color: #e6edf3;
      margin: 0 0 0.1rem 0;
      line-height: 1.2;
    }
    .chordpro-output h2 {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 0.8em;
      color: #8b949e;
      margin: 0 0 0.6rem 0;
      line-height: 1.4;
    }

    /* <rt class="chord"> — chord annotation above lyrics (native ruby) */
    .chordpro-output ruby rt,
    .chordpro-output .chord {
      color: #f59e0b;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 0.85em;
      line-height: 1.2;
      white-space: nowrap;
    }
    .chordpro-output .chord-quality,
    .chordpro-output ruby rt .chord-quality {
      font-size: 0.82em;
      vertical-align: 0.15em;
      line-height: 1;
    }
    .chordpro-output ruby rt.chord-optional,
    .chordpro-output .chord.chord-optional { opacity: 0.45; }
    .chordpro-output ruby rt.chord-annotation,
    .chordpro-output .chord.chord-annotation {
      color: #8b949e;
      font-weight: normal;
      font-family: inherit;
      font-style: italic;
    }
    .chordpro-output .chord-bass,
    .chordpro-output ruby rt .chord-bass { font-size: 0.8em; }

    /* Section header chord: block display, section-color override */
    .chordpro-output .section-header-row .chord {
      color: #38bdf8;
    }

    /* Lyrics: only present in section-header-rows after JS conversion */
    .chordpro-output .lyrics { line-height: 1.6; }
    .chordpro-output .section-header-row .lyrics { display: none; }
    .chordpro-output ruby { line-height: 1.6; }

    .chordpro-output .comment {
      color: #8b949e;
      font-style: italic;
      margin: 0.25rem 0;
      font-size: 0.875em;
    }
    .chordpro-output .metadata { display: none; }

    .chordpro-output .paragraph.chorus {
      padding-left: 1rem;
      border-left: 2px solid rgba(245, 158, 11, 0.5);
    }
    .chordpro-output .chorus-section {
      padding-left: 1rem;
      border-left: 2px solid rgba(245, 158, 11, 0.5);
    }

    .chordpro-output .comment.inline-chord-comment {
      font-style: normal;
      white-space: pre-wrap;
      color: #e6edf3;
    }
    .chordpro-output .comment .inline-chord {
      color: #f59e0b;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      font-size: 0.9em;
      vertical-align: baseline;
    }
  </style>
</head>
<body>
  <!-- Full-width layout — resize the browser window to match the device you're debugging -->
  <div class="chordpro-output chordpro-columns-${colCount}">
    ${rawHtml}
  </div>
  <div class="debug-info">
    <h2>ChordCrew Debug — ${inputPath.split('/').pop()}</h2>
    <p>Columns: <span class="key">${colCount}</span> &nbsp;|&nbsp; Font: <span class="key">${fontScale}rem</span> &nbsp;|&nbsp; Transpose: <span class="key">${semitones >= 0 ? '+' : ''}${semitones}</span> &nbsp;|&nbsp; Resize window to match target device width</p>
    <p style="margin-top:0.25rem;color:#484f58">Usage: node scripts/render-debug.mjs [file] [out.html] [cols] [fontscale] [semitones]</p>
  </div>
  <script>
    ${postProcessingJS}
  </script>
</body>
</html>`

writeFileSync(outputPath, html, 'utf8')
console.log(`Written to: ${outputPath}`)
console.log(`Open with: open ${outputPath}`)
