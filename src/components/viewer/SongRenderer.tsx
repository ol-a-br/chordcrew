import { useMemo } from 'react'
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

export function SongRenderer({
  content,
  transposeOffset = 0,
  columns = 1,
  lyricsOnly = false,
  fontScale = 1,
  className,
}: SongRendererProps) {
  const html = useMemo(
    () => renderToHtml(content, transposeOffset),
    [content, transposeOffset]
  )

  return (
    <div
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
