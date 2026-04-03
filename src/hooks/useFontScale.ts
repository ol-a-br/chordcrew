import { useState } from 'react'

const STORAGE_KEY = 'chordcrew-font-scale'
const DEFAULT_SCALE = 1.0

function readScale(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v) { const n = parseFloat(v); if (isFinite(n)) return n }
  } catch { /* SSR / private mode */ }
  return DEFAULT_SCALE
}

/** Font scale shared between Viewer and Performance pages via localStorage. */
export function useFontScale() {
  const [fontScale, setScaleState] = useState<number>(readScale)

  const setFontScale = (updater: number | ((prev: number) => number)) => {
    setScaleState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  return [fontScale, setFontScale] as const
}
