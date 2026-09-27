// ─── Web MIDI output ─────────────────────────────────────────────────────────
// Thin wrapper around the Web MIDI API that sends a song's Kemper rig + tempo
// (see ./kemper.ts) when the song is opened.
//
// Stage-safe by design: it never shows UI, never throws, and never triggers the
// browser's permission prompt outside Settings (the only interactive caller).
// In browsers without Web MIDI — Safari on iPad/iPhone — every call is a no-op.
// MIDI is local I/O to a Bluetooth/USB device: no network, no sync.

import { getSettings } from '@/db'
import type { AppSettings } from '@/types'
import { buildSongMidi, type ScheduledMidi, type SongMidiData } from './kemper'

export interface MidiOutputInfo {
  id: string
  name: string
  connected: boolean
}

export interface ActiveSongMidi extends SongMidiData {
  songId: string
}

let accessPromise: Promise<MIDIAccess> | null = null
let activeSong: ActiveSongMidi | null = null
let lastSentKey: string | null = null
let busyUntil = 0      // performance.now() time at which the last scheduled message goes out
const listeners = new Set<() => void>()

export function isMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
}

async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'midi' as PermissionName })).state
  } catch {
    return 'unknown'
  }
}

/**
 * The shared MIDIAccess, or null when unsupported or not permitted.
 * Non-interactive callers (song pages) only proceed when permission was
 * already granted in Settings, so no prompt can ever pop up on stage.
 */
export async function getMidiAccess(interactive = false): Promise<MIDIAccess | null> {
  if (!isMidiSupported()) return null
  if (!accessPromise) {
    if (!interactive) {
      const state = await permissionState()
      if (state === 'prompt' || state === 'denied') return null
    }
    if (!accessPromise) {
      accessPromise = navigator.requestMIDIAccess().then(access => {
        access.addEventListener('statechange', onStateChange)
        return access
      })
    }
  }
  try {
    return await accessPromise
  } catch {
    accessPromise = null
    return null
  }
}

function onStateChange(e: Event) {
  const port = (e as MIDIConnectionEvent).port
  if (port?.type === 'output') {
    // Send the current song again once the output is back (e.g. Kemper rebooted).
    if (port.state === 'disconnected') lastSentKey = null
    // A newly connected output may be the selected one — e.g. the Kemper
    // finished booting after the song was opened.
    else void sendActiveSong()
  }
  listeners.forEach(fn => fn())
}

/** Subscribe to MIDI port changes (devices appearing / disappearing). Returns an unsubscribe function. */
export function onMidiPortsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function listOutputs(access: MIDIAccess): MidiOutputInfo[] {
  return [...access.outputs.values()].map(o => ({
    id: o.id,
    name: o.name || o.id,
    connected: o.state === 'connected',
  }))
}

function findOutput(access: MIDIAccess, settings: AppSettings): MIDIOutput | null {
  const connected = [...access.outputs.values()].filter(o => o.state === 'connected')
  return connected.find(o => o.id === settings.midiOutputId)
    ?? connected.find(o => !!settings.midiOutputName && o.name === settings.midiOutputName)
    ?? null
}

function schedule(output: MIDIOutput, messages: ScheduledMidi[]) {
  if (messages.length === 0) return
  // Queue behind anything still pending so two songs' messages never
  // interleave (matters for tap tempo, whose taps span about two seconds).
  // Timestamps let the browser time the messages even while the main thread
  // is busy rendering the new song.
  const start = Math.max(performance.now(), busyUntil)
  for (const m of messages) output.send(m.data, start + m.delayMs)
  busyUntil = start + Math.max(...messages.map(m => m.delayMs)) + 20
}

async function sendActiveSong(): Promise<void> {
  const song = activeSong
  if (!song) return
  try {
    const settings = await getSettings()
    if (!settings.midiEnabled) return
    const access = await getMidiAccess(false)
    const output = access && findOutput(access, settings)
    // No output yet → onStateChange retries as soon as one connects.
    if (!output || activeSong !== song) return
    const key = JSON.stringify([
      song.songId, song.rig, song.bpm, output.id, settings.midiChannel, settings.midiTempoMode,
    ])
    if (key === lastSentKey) return   // same song opened again, e.g. Viewer → Performance
    lastSentKey = key
    schedule(output, buildSongMidi(song, {
      channel: settings.midiChannel,
      tempoMode: settings.midiTempoMode,
    }))
  } catch {
    // Never let MIDI break a song page.
  }
}

/** Called by song pages on song change; null when the page is left. */
export function setActiveSong(song: ActiveSongMidi | null): void {
  activeSong = song
  if (song) void sendActiveSong()
}

/** Settings "Test" button: sends a rig/tempo right away. False when no selected output is connected. */
export async function sendMidiTest(data: SongMidiData, settings: AppSettings): Promise<boolean> {
  try {
    const access = await getMidiAccess(true)
    const output = access && findOutput(access, settings)
    if (!output) return false
    schedule(output, buildSongMidi(data, {
      channel: settings.midiChannel,
      tempoMode: settings.midiTempoMode,
    }))
    lastSentKey = null   // the Kemper state changed — re-opening a song sends again
    return true
  } catch {
    return false
  }
}
