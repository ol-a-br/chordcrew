import { useEffect, useMemo } from 'react'
import type { Song } from '@/types'
import { extractMeta } from '@/utils/chordpro'
import { parseKemperRig } from './kemper'
import { isMidiSupported, setActiveSong } from './midiService'

/**
 * Sends the song's Kemper rig ({x_kemper_rig}) and tempo ({tempo}) when the
 * song is opened. Silent no-op when MIDI is disabled in Settings or the
 * browser has no Web MIDI.
 */
export function useSongMidi(song: Song | undefined): void {
  const songId = song?.id
  const content = song?.transcription.content
  const bpm = song?.transcription.tempo ?? 0
  const rigValue = useMemo(() => (content ? extractMeta(content).kemperRig : undefined), [content])

  useEffect(() => {
    if (!songId || !isMidiSupported()) return
    setActiveSong({ songId, rig: parseKemperRig(rigValue), bpm })
    return () => setActiveSong(null)
  }, [songId, rigValue, bpm])
}
