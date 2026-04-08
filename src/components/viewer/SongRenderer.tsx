import { useMemo, useRef, useEffect } from 'react'
import { renderToHtml, isKnownChord, expandRepeatSections } from '@/utils/chordpro'

// ─── Module-level render cache ────────────────────────────────────────────────
// Persists across component remounts for the session lifetime.
// Key: `${transposeOffset}|${expandRepeats}|${content}` — putting content last
// means short prefixes separate different settings of the same song quickly.
const renderCache = new Map<string, string>()

export function isSongCached(content: string, transposeOffset: number, expandRepeats: boolean): boolean {
  const key = `${transposeOffset}|${expandRepeats ? 1 : 0}|${content}`
  return renderCache.has(key)
}

export function getCachedHtml(content: string, transposeOffset: number, expandRepeats: boolean): string {
  const key = `${transposeOffset}|${expandRepeats ? 1 : 0}|${content}`
  const cached = renderCache.get(key)
  if (cached !== undefined) return cached
  const processed = expandRepeats ? expandRepeatSections(content) : content
  const html = renderToHtml(processed, transposeOffset)
  renderCache.set(key, html)
  return html
}

/**
 * Pre-render a song's HTML in the background so the cache is warm before
 * the user navigates to it. Call after the current song has rendered.
 */
export function prewarmSongCache(
  content: string,
  transposeOffset: number,
  expandRepeats: boolean
): void {
  const key = `${transposeOffset}|${expandRepeats ? 1 : 0}|${content}`
  if (renderCache.has(key)) return
  // Run on next idle frame so it doesn't compete with current paint
  const schedule = typeof requestIdleCallback !== 'undefined'
    ? (fn: () => void) => requestIdleCallback(fn, { timeout: 2000 })
    : (fn: () => void) => setTimeout(fn, 0)
  schedule(() => getCachedHtml(content, transposeOffset, expandRepeats))
}
import type { ChordProError } from '@/utils/chordpro'
import { clsx } from 'clsx'
import { AlertTriangle } from 'lucide-react'

interface SongRendererProps {
  content: string
  transposeOffset?: number
  columns?: number
  lyricsOnly?: boolean
  fontScale?: number
  pageFlip?: boolean
  expandRepeats?: boolean   // expand empty repeat sections with first-occurrence content
  className?: string
  errors?: ChordProError[]
  onJumpToLine?: (line: number) => void
}

/** Terms (lowercase) that identify a chorus section by label text */
const CHORUS_TERMS = ['chorus', 'refrän', 'refrain', 'ref', 'refr', 'refrein']

function isChorusLabel(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return CHORUS_TERMS.some(t => lower === t || lower.startsWith(t + ' ') || lower.startsWith(t + '-'))
}

/** Split a chord name into root + quality + bass. E.g. "Dsus4/A" → {root:"D", quality:"sus4", bass:"/A"}
 *  Parenthesized modifiers are normalised: "D(4)" → {root:"D", quality:"4", bass:""}
 */
function splitChordName(chord: string): { root: string; quality: string; bass: string } {
  const slashIdx = chord.indexOf('/')
  const bass = slashIdx !== -1 ? chord.slice(slashIdx) : ''
  const main = slashIdx !== -1 ? chord.slice(0, slashIdx) : chord
  const m = main.match(/^([A-G][b#]?)(.*)$/)
  if (!m) return { root: chord, quality: '', bass: '' }
  let quality = m[2]
  // Normalize parenthesized modifier: "(4)" → "4"
  if (quality.startsWith('(') && quality.endsWith(')')) {
    quality = quality.slice(1, -1)
  }
  return { root: m[1], quality, bass }
}

export function SongRenderer({
  content,
  transposeOffset = 0,
  columns = 1,
  lyricsOnly = false,
  fontScale = 1,
  pageFlip = false,
  expandRepeats = false,
  className,
  errors,
  onJumpToLine,
}: SongRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Use module-level cache — cache hits are instant even after component remount
  const html = useMemo(
    () => getCachedHtml(content, transposeOffset, expandRepeats ?? false),
    [content, transposeOffset, expandRepeats]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Clear previous injections ─────────────────────────────────────────────
    container.querySelectorAll('.section-badge').forEach(el => el.remove())
    container.querySelectorAll('.chorus-section, .section-header-row').forEach(el => {
      el.classList.remove('chorus-section', 'section-header-row')
    })

    // ── Track section names → letters + repeat counts ─────────────────────────
    const nameToLetter = new Map<string, string>()
    const letterCount  = new Map<string, number>()
    let nextIdx = 0

    function assignBadge(sectionName: string): { letter: string; count: number } {
      const key = sectionName.toLowerCase().trim()
      if (nameToLetter.has(key)) {
        const letter = nameToLetter.get(key)!
        const count = (letterCount.get(letter) ?? 0) + 1
        letterCount.set(letter, count)
        return { letter, count }
      }
      nextIdx++
      const letter = String.fromCharCode(64 + nextIdx) // A=65
      nameToLetter.set(key, letter)
      letterCount.set(letter, 1)
      return { letter, count: 1 }
    }

    function createBadge(letter: string, count: number): HTMLSpanElement {
      const badge = document.createElement('span')
      badge.className = 'section-badge'
      badge.textContent = count === 1 ? letter : `${letter}${count}`
      return badge
    }

    function injectBadge(anchor: Element, sectionName: string): void {
      const { letter, count } = assignBadge(sectionName)
      // Prepend inside anchor so badge + label text share the same inline baseline
      anchor.prepend(createBadge(letter, count))
    }

    // ── Process each paragraph in document order ──────────────────────────────
    container.querySelectorAll<HTMLElement>('.paragraph').forEach(para => {

      // Case 1: Directive-based sections — chordsheetjs outputs h3.label
      // Multiple named sections can share one paragraph (they merge).
      const labelEls = para.querySelectorAll<HTMLElement>('h3.label')
      if (labelEls.length > 0) {
        labelEls.forEach(labelEl => {
          const name = labelEl.textContent ?? ''
          injectBadge(labelEl, name)

          if (isChorusLabel(name)) {
            // Only add .chorus-section to rows if the paragraph doesn't already have
            // .chorus class (added by chordsheetjs for {start_of_chorus:} directives).
            // If .paragraph.chorus is present, the CSS rule handles the indent/bar.
            const labelPara = labelEl.closest<HTMLElement>('.paragraph')
            if (!labelPara?.classList.contains('chorus')) {
              const labelRow = labelEl.closest<HTMLElement>('.row')
              if (labelRow) {
                labelRow.classList.add('chorus-section')
                let sib = labelRow.nextElementSibling
                while (sib?.classList.contains('row')) {
                  if (sib.querySelector('h3.label')) break
                  sib.classList.add('chorus-section')
                  sib = sib.nextElementSibling
                }
              }
            }
          }
        })
        return
      }

      // Case 2: Bracket-notation section header
      // Pattern: first .row has a first column whose .chord is a non-chord name (e.g. Intro, Verse)
      // and whose .lyrics is empty. Subsequent chord columns (if any) are moved to a new row.
      const firstRow = para.querySelector<HTMLElement>(':scope > .row')
      if (!firstRow) return

      const cols = Array.from(firstRow.querySelectorAll<HTMLElement>(':scope > .column'))
      if (cols.length === 0) return

      const chordEl = cols[0].querySelector<HTMLElement>('.chord')
      const lyricsEl = cols[0].querySelector<HTMLElement>('.lyrics')
      if (!chordEl || !lyricsEl) return

      const chordText = chordEl.textContent?.trim() ?? ''
      if (!chordText || lyricsEl.textContent?.trim() !== '') return
      if (isKnownChord(chordText)) return

      firstRow.classList.add('section-header-row')
      const { letter, count } = assignBadge(chordText)
      firstRow.insertBefore(createBadge(letter, count), firstRow.firstChild)

      // If additional chord columns follow the section name, move them to a new row
      if (cols.length > 1) {
        const newRow = document.createElement('div')
        newRow.className = 'row'
        cols.slice(1).forEach(col => newRow.appendChild(col))
        firstRow.after(newRow)
      }

      if (isChorusLabel(chordText)) {
        para.classList.add('chorus-section')
      }
    })

    // ── Chord processing pass ─────────────────────────────────────────────────
    container.querySelectorAll<HTMLElement>('.chord').forEach(el => {
      if (el.closest('.section-header-row')) return     // skip section names
      if (el.querySelector('span, sup')) return         // already processed

      let text = el.textContent?.trim() ?? ''
      if (!text) return

      // Parenthesised optional chords: "(Am)" → strip parens, add opacity class
      if (text.startsWith('(') && text.endsWith(')')) {
        text = text.slice(1, -1).trim()
        el.textContent = text
        el.classList.add('chord-optional')
      }

      if (!isKnownChord(text)) {
        // Not a chord — treat as inline performance instruction (e.g. "To Bridge")
        el.classList.add('chord-annotation')
        return
      }

      // Split into root + quality modifier (slightly smaller, slightly raised)
      const { root, quality, bass } = splitChordName(text)
      if (!quality && !bass) return                     // plain root like 'A', 'G'
      el.textContent = ''
      const rootSpan = document.createElement('span')
      rootSpan.textContent = root
      el.appendChild(rootSpan)
      if (quality) {
        const qSpan = document.createElement('span')
        qSpan.className = 'chord-quality'
        qSpan.textContent = quality
        el.appendChild(qSpan)
      }
      if (bass) {
        const bSpan = document.createElement('span')
        bSpan.className = 'chord-bass'
        bSpan.textContent = bass
        el.appendChild(bSpan)
      }
    })
    // ── Mid-word column spacing fix ───────────────────────────────────────────
    // The .row flex container has column-gap:0.3em between ALL .column children.
    // For chords placed inside a word (e.g. Vat[A]er), the gap inserts a visual
    // space between "Vat" and "er". Detect these and cancel the gap with a
    // negative margin-left. Gap is preserved when previous lyrics end in space
    // (word boundary) or both lyric sides are empty (chord-only lines).
    container.querySelectorAll<HTMLElement>('.row').forEach(row => {
      const rowCols = Array.from(row.querySelectorAll<HTMLElement>(':scope > .column'))
      rowCols.forEach((col, i) => {
        if (i === 0) return
        const prevLyrics = rowCols[i - 1].querySelector('.lyrics')?.textContent ?? ''
        const thisLyrics = col.querySelector('.lyrics')?.textContent ?? ''
        if (prevLyrics && !prevLyrics.endsWith(' ') && !thisLyrics.startsWith(' ')) {
          col.style.marginLeft = '-0.3em'
        }
      })
    })

    // ── Pass 2: Repeat indicators (↺ SectionName) → look up section letter ───
    // These are injected by preprocessChordPro from {repeat: SectionName}.
    // Since Pass 1 has already assigned letters to real sections, we can now
    // look up the section name, increment its count, and inject a repeat badge.
    container.querySelectorAll<HTMLElement>('.comment').forEach(commentEl => {
      const text = commentEl.textContent?.trim() ?? ''
      if (!text.startsWith('↺')) return
      // Extract section name: strip "↺ " prefix and optional " ×N" suffix
      const sectionName = text.replace(/^↺\s*/, '').replace(/\s+×\d+\s*$/, '').trim()
      if (!sectionName) return
      let key = sectionName.toLowerCase().trim()
      // Alias fallback: if the repeat refers to a chorus term not in the map,
      // try all known chorus terms (handles multi-language: "Refrän" → "chorus").
      if (!nameToLetter.has(key) && isChorusLabel(sectionName)) {
        for (const term of CHORUS_TERMS) {
          if (nameToLetter.has(term)) { key = term; break }
        }
      }
      if (!nameToLetter.has(key)) return
      const letter = nameToLetter.get(key)!
      const count = (letterCount.get(letter) ?? 1) + 1
      letterCount.set(letter, count)
      // Prepend inside the comment so badge + ↺ text share the same inline baseline
      commentEl.prepend(createBadge(letter, count))
    })

    // ── Inline chord comments (from {inline:} directive) ─────────────────────
    // The preprocessor converts {inline: | [C] / / / |} to a {comment:} line
    // with chord names wrapped in «guillemet» markers. We expand those into
    // chord-styled <span>s so everything sits on the same baseline as | and /.
    container.querySelectorAll<HTMLElement>('.comment').forEach(commentEl => {
      const text = commentEl.textContent ?? ''
      if (!text.includes('«')) return
      commentEl.classList.add('inline-chord-comment')
      // Split on «ChordName» markers using textContent (avoids &laquo; entity issues)
      // Odd indices are chord names, even indices are plain text (|, /, spaces)
      const parts = text.split(/«([^»]*)»/)
      commentEl.textContent = ''
      parts.forEach((part, i) => {
        if (i % 2 === 1) {
          const span = document.createElement('span')
          span.className = 'chord inline-chord'
          span.textContent = part
          commentEl.appendChild(span)
        } else {
          commentEl.appendChild(document.createTextNode(part))
        }
      })
    })
  }, [html])

  return (
    <>
    {errors && errors.length > 0 && (
      <div className="mx-4 mt-3 mb-1 bg-red-900/20 border border-red-700/40 rounded-lg overflow-hidden text-sm">
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 text-red-300 font-medium">
          <AlertTriangle size={14} />
          {errors.length} parse {errors.length === 1 ? 'error' : 'errors'}
        </div>
        <ul className="divide-y divide-red-900/20">
          {errors.map((err, i) => (
            <li key={i} className="flex items-start gap-3 px-3 py-2">
              <span className="text-red-400 font-mono text-xs shrink-0 mt-0.5">Line {err.line}</span>
              <div className="flex-1 min-w-0">
                <div className="text-red-200 text-xs">{err.message}</div>
                <div className="text-red-400/70 font-mono text-xs truncate mt-0.5">{err.text}</div>
              </div>
              {onJumpToLine && (
                <button
                  onClick={() => onJumpToLine(err.line)}
                  className="shrink-0 text-xs text-chord hover:text-chord/80 transition-colors mt-0.5"
                >
                  Fix →
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )}
    <div
      ref={containerRef}
      className={clsx(
        'chordpro-output',
        `chordpro-columns-${columns}`,
        lyricsOnly && 'lyrics-only',
        pageFlip && 'page-flip',
        className
      )}
      style={{ fontSize: `${fontScale}rem` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
    </>
  )
}
