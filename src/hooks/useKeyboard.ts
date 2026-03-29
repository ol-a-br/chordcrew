import { useEffect, useCallback } from 'react'

interface UseKeyboardNavOptions {
  onNext: () => void
  onPrev: () => void
  nextKey?: string
  prevKey?: string
  enabled?: boolean
}

/**
 * Listens for keyboard events (including PageFlip Cicada V7 in Left/Right Arrow mode)
 * and calls onNext / onPrev accordingly.
 *
 * Pedal setup: Set Cicada to Mode 2 (Left/Right Arrow).
 * Right pedal → ArrowRight → onNext
 * Left pedal  → ArrowLeft  → onPrev
 */
export function useKeyboardNav({
  onNext,
  onPrev,
  nextKey = 'ArrowRight',
  prevKey = 'ArrowLeft',
  enabled = true,
}: UseKeyboardNavOptions) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire when typing in an input / textarea / contenteditable
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.key === nextKey) { e.preventDefault(); onNext() }
      if (e.key === prevKey) { e.preventDefault(); onPrev() }
    },
    [onNext, onPrev, nextKey, prevKey]
  )

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [enabled, handleKey])
}

/**
 * Listens for a single keypress to capture a key binding.
 * Used in Settings to let the user reassign pedal keys.
 */
export function useCaptureKey(
  active: boolean,
  onCapture: (key: string) => void
) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      onCapture(e.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onCapture])
}
