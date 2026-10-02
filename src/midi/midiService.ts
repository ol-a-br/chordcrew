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
import { buildSongMidi, type ScheduledMidi, type SongMidiData, type TempoMode } from './kemper'

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
let accessError: string | null = null
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
      // Wrap in a real Promise: the iOS "Web MIDI Browser" polyfill returns a
      // thenable whose then() only stores the callbacks and returns undefined.
      accessPromise = new Promise<MIDIAccess>((resolve, reject) => {
        navigator.requestMIDIAccess().then(resolve, reject)
      }).then(access => {
        access.addEventListener('statechange', onStateChange)
        return access
      })
    }
  }
  try {
    const access = await accessPromise
    accessError = null
    return access
  } catch (e) {
    accessPromise = null
    // Polyfills may reject with a non-Error (even an empty string) — always report something.
    accessError = e instanceof Error
      ? `${e.name}: ${e.message}`
      : (typeof e === 'string' ? e : JSON.stringify(e) ?? String(e)) || `empty ${typeof e} rejection`
    return null
  }
}

/** Why the last getMidiAccess() call failed (e.g. "SecurityError: …"), for Settings. Null after a success. */
export function getMidiAccessError(): string | null {
  return accessError
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

/**
 * All outputs as an array. Uses forEach because the iOS polyfill's port map
 * returns iterators that aren't iterable (no Symbol.iterator), so spread fails.
 */
function outputsOf(access: MIDIAccess): MIDIOutput[] {
  const outputs: MIDIOutput[] = []
  access.outputs.forEach(o => { outputs.push(o) })
  return outputs
}

export function listOutputs(access: MIDIAccess): MidiOutputInfo[] {
  return outputsOf(access).map(o => ({
    id: String(o.id),   // the iOS polyfill uses numeric CoreMIDI ids
    name: o.name || String(o.id),
    connected: o.state === 'connected',
  }))
}

function findOutput(access: MIDIAccess, settings: AppSettings): MIDIOutput | null {
  const connected = outputsOf(access).filter(o => o.state === 'connected')
  return connected.find(o => String(o.id) === settings.midiOutputId)
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

function sendOptions(settings: AppSettings): { channel: number; tempoMode: TempoMode } {
  return {
    channel: settings.midiChannel,
    tempoMode: settings.midiSendTempo ? settings.midiTempoMode : 'off',
  }
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
    const opts = sendOptions(settings)
    const data: SongMidiData = { rig: settings.midiSendRig ? song.rig : null, bpm: song.bpm }
    const key = JSON.stringify([song.songId, data.rig, data.bpm, output.id, opts])
    if (key === lastSentKey) return   // same song opened again, e.g. Viewer → Performance
    lastSentKey = key
    schedule(output, buildSongMidi(data, opts))
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
    // The test sends exactly what was typed, regardless of the rig / tempo switches.
    schedule(output, buildSongMidi(data, { channel: settings.midiChannel, tempoMode: settings.midiTempoMode }))
    lastSentKey = null   // the Kemper state changed — re-opening a song sends again
    return true
  } catch {
    return false
  }
}
