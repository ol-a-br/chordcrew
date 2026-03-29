import { useMemo, useRef, useEffect } from 'react'
import { renderToHtml } from '@/utils/chordpro'
import { clsx } from 'clsx'

interface SongRendererProps {
  content: string
  transposeOffset?: number
  columns?: 1 | 2 | 3
  lyricsOnly?: boolean
  fontScale?: number
  className?: string
}

/** Terms (lowercase) that identify a chorus section by label text */
const CHORUS_TERMS = ['chorus', 'refrän', 'refrain', 'ref', 'refr']

function isChorusLabel(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return CHORUS_TERMS.some(t => lower === t || lower.startsWith(t + ' '))
}

export function SongRenderer({
  content,
  transposeOffset = 0,
  columns = 1,
  lyricsOnly = false,
  fontScale = 1,
  className,
}: SongRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(
    () => renderToHtml(content, transposeOffset),
    [content, transposeOffset]
  )

  // Post-process: find named chorus sections and mark their rows with
  // .chorus-section so the vertical bar CSS rule applies.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear previous marks from prior renders
    container.querySelectorAll('.chorus-section').forEach(el => {
      el.classList.remove('chorus-section')
    })

    // Find every h3.label — each one opens a new section
    const labelRows = container.querySelectorAll<HTMLElement>('.row:has(h3.label)')
    labelRows.forEach(labelRow => {
      const label = labelRow.querySelector('h3.label')
      if (!label || !isChorusLabel(label.textContent ?? '')) return

      // Mark this label row and every following sibling row (until the next
      // label row or end of parent) with the chorus-section class.
      const nodes: Element[] = [labelRow]
      let sibling = labelRow.nextElementSibling
      while (sibling && sibling.classList.contains('row')) {
        if (sibling.querySelector('h3.label')) break
        nodes.push(sibling)
        sibling = sibling.nextElementSibling
      }
      nodes.forEach(n => n.classList.add('chorus-section'))
    })
  }, [html])

  return (
    <div
      ref={containerRef}
      className={clsx(
        'chordpro-output',
        `chordpro-columns-${columns}`,
        lyricsOnly && 'lyrics-only',
        className
      )}
      style={{ fontSize: `${fontScale}rem` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
