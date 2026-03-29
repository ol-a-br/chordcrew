import { useMemo, useRef, useEffect } from 'react'
import { renderToHtml } from '@/utils/chordpro'
import { isKnownChord } from '@/utils/chordpro'
import { clsx } from 'clsx'

interface SongRendererProps {
  content: string
  transposeOffset?: number
  columns?: number
  lyricsOnly?: boolean
  fontScale?: number
  pageFlip?: boolean
  className?: string
}

/** Terms (lowercase) that identify a chorus section by label text */
const CHORUS_TERMS = ['chorus', 'refrän', 'refrain', 'ref', 'refr', 'refrein']

function isChorusLabel(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return CHORUS_TERMS.some(t => lower === t || lower.startsWith(t + ' ') || lower.startsWith(t + '-'))
}

export function SongRenderer({
  content,
  transposeOffset = 0,
  columns = 1,
  lyricsOnly = false,
  fontScale = 1,
  pageFlip = false,
  className,
}: SongRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(
    () => renderToHtml(content, transposeOffset),
    [content, transposeOffset]
  )

  // Post-process: detect section headers (both directive h3.label and bracket-notation)
  // and inject [A][B][C] badges + chorus vertical bar classes.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear previous injections
    container.querySelectorAll('.section-badge').forEach(el => el.remove())
    container.querySelectorAll('.chorus-section, .section-header-row').forEach(el => {
      el.classList.remove('chorus-section', 'section-header-row')
    })

    let sectionIndex = 0

    container.querySelectorAll<HTMLElement>('.paragraph').forEach(para => {

      // ── Case 1: Directive-based sections have h3.label elements ──────────
      // Multiple named sections can share one paragraph (chordsheetjs merges them).
      const labelEls = para.querySelectorAll<HTMLElement>('h3.label')
      if (labelEls.length > 0) {
        labelEls.forEach(labelEl => {
          sectionIndex++
          const letter = String.fromCharCode(64 + sectionIndex) // 65='A'
          const labelText = labelEl.textContent ?? ''

          // Inject badge as sibling BEFORE h3.label inside its .row
          const row = labelEl.parentElement
          if (row) {
            const badge = document.createElement('span')
            badge.className = 'section-badge'
            badge.textContent = `[${letter}]`
            row.insertBefore(badge, labelEl)
          }

          // Chorus detection: mark rows from this label to the next label
          if (isChorusLabel(labelText)) {
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
        })
        return
      }

      // ── Case 2: Bracket-notation section header ───────────────────────────
      // Pattern: first .row has exactly one .column, the .chord contains the
      // section name (not a real chord), and .lyrics is empty.
      // Each bracket-section gets its own .paragraph — so we mark the whole paragraph.
      const firstRow = para.querySelector<HTMLElement>(':scope > .row')
      if (!firstRow) return

      const cols = firstRow.querySelectorAll(':scope > .column')
      if (cols.length !== 1) return

      const chordEl = cols[0].querySelector<HTMLElement>('.chord')
      const lyricsEl = cols[0].querySelector<HTMLElement>('.lyrics')
      if (!chordEl || !lyricsEl) return

      const chordText = chordEl.textContent?.trim() ?? ''
      if (!chordText || lyricsEl.textContent?.trim() !== '') return
      if (isKnownChord(chordText)) return  // It's a real chord, not a section name

      // Mark as section header
      sectionIndex++
      const letter = String.fromCharCode(64 + sectionIndex)
      firstRow.classList.add('section-header-row')

      // Inject badge before the column inside the row
      const badge = document.createElement('span')
      badge.className = 'section-badge'
      badge.textContent = `[${letter}]`
      firstRow.insertBefore(badge, firstRow.firstChild)

      // Chorus: mark the entire paragraph (bracket sections have their own paragraph)
      if (isChorusLabel(chordText)) {
        para.classList.add('chorus-section')
      }
    })
  }, [html])

  return (
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
  )
}
