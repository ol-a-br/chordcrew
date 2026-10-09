// ─── Kemper Profiler MIDI messages ───────────────────────────────────────────
// Pure message builders — no Web MIDI access here, so they are unit-testable.
// Reference: KEMPER PROFILER MIDI Parameter Documentation (OS 11+).
//
// Per song we send up to two things when it is opened:
//   1. the rig  — a Program Change, optionally preceded by Bank Select
//   2. the tempo — by default as an exact NRPN write of the Rig Tempo
//      parameter (address page 4, parameter 0, raw value = BPM × 64);
//      optionally as four Tap Tempo presses (CC 30) for setups where NRPN
//      is not wanted. MIDI clock is deliberately not used: it would have to
//      run continuously and jitters over Bluetooth MIDI.

export type MidiMessage = number[]

/** A MIDI byte sequence (one or more complete messages) sent `delayMs` after the song change. */
export interface ScheduledMidi {
  data: MidiMessage
  delayMs: number
}

/**
 * Rig reference from the `{x_kemper_rig: …}` directive.
 *   program     — "17"  → Program Change 17 (1–128, as numbered on the Kemper)
 *   performance — "6.2" → Performance 6, Slot 2 (Performance Mode; 125 × 5 slots)
 */
export type KemperRig =
  | { kind: 'program'; program: number }
  | { kind: 'performance'; performance: number; slot: number }

export type TempoMode = 'nrpn' | 'tap' | 'off'

export interface SongMidiData {
  rig: KemperRig | null
  bpm: number              // 0 = no tempo set
}

export const KEMPER_SLOTS_PER_PERFORMANCE = 5
export const KEMPER_PERFORMANCES = 125
export const TEMPO_MIN_BPM = 20
export const TEMPO_MAX_BPM = 255     // 255 × 64 still fits the 14-bit NRPN value
export const TAP_COUNT = 4
/** Wait after a rig change before setting the tempo, so a tempo stored in the rig can't override it. */
export const RIG_LOAD_DELAY_MS = 300

const CC = 0xB0
const PC = 0xC0
const CC_BANK_MSB = 0
const CC_BANK_LSB = 32
const CC_NRPN_MSB = 99
const CC_NRPN_LSB = 98
const CC_DATA_MSB = 6
const CC_DATA_LSB = 38
const CC_TAP_TEMPO = 30
const NRPN_PAGE_RIG = 4
const NRPN_RIG_TEMPO = 0
const NRPN_NULL = 127

export function parseKemperRig(value: string | undefined): KemperRig | null {
  const v = value?.trim()
  if (!v) return null

  const program = v.match(/^(\d{1,3})$/)
  if (program) {
    const n = Number(program[1])
    return n >= 1 && n <= 128 ? { kind: 'program', program: n } : null
  }

  const perf = v.match(/^(\d{1,3})\s*[./]\s*(\d)$/)
  if (perf) {
    const performance = Number(perf[1])
    const slot = Number(perf[2])
    if (performance < 1 || performance > KEMPER_PERFORMANCES) return null
    if (slot < 1 || slot > KEMPER_SLOTS_PER_PERFORMANCE) return null
    return { kind: 'performance', performance, slot }
  }

  return null
}

export function formatKemperRig(rig: KemperRig): string {
  return rig.kind === 'program'
    ? `PC ${rig.program}`
    : `Perf ${rig.performance} · Slot ${rig.slot}`
}

function channelNibble(channel: number): number {
  return Math.min(16, Math.max(1, Math.round(channel))) - 1
}

/** Bank Select + Program Change for a rig. Performance slots map to one running index across banks of 128. */
export function rigMessages(rig: KemperRig, channel: number): MidiMessage {
  const ch = channelNibble(channel)
  if (rig.kind === 'program') return [PC | ch, rig.program - 1]

  const index = (rig.performance - 1) * KEMPER_SLOTS_PER_PERFORMANCE + (rig.slot - 1)
  return [
    CC | ch, CC_BANK_MSB, 0,
    CC | ch, CC_BANK_LSB, Math.floor(index / 128),
    PC | ch, index % 128,
  ]
}

export function isValidTempo(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= TEMPO_MIN_BPM && bpm <= TEMPO_MAX_BPM
}

/** NRPN write of the Rig Tempo (raw value = BPM × 64), then the NRPN null address so later data-entry CCs can't touch it. */
export function tempoNrpnMessages(bpm: number, channel: number): MidiMessage {
  const ch = channelNibble(channel)
  const value = Math.min(16383, Math.round(bpm * 64))
  return [
    CC | ch, CC_NRPN_MSB, NRPN_PAGE_RIG,
    CC | ch, CC_NRPN_LSB, NRPN_RIG_TEMPO,
    CC | ch, CC_DATA_MSB, value >> 7,
    CC | ch, CC_DATA_LSB, value & 0x7F,
    CC | ch, CC_NRPN_MSB, NRPN_NULL,
    CC | ch, CC_NRPN_LSB, NRPN_NULL,
  ]
}

/**
 * Tap Tempo presses one beat apart. Value 0 is the Kemper's single-event tap
 * (value 1 would be a "press" that starts the Beat Scanner if no release follows).
 */
export function tapTempoMessages(bpm: number, channel: number, startDelayMs = 0): ScheduledMidi[] {
  const ch = channelNibble(channel)
  const intervalMs = 60000 / bpm
  return Array.from({ length: TAP_COUNT }, (_, i) => ({
    data: [CC | ch, CC_TAP_TEMPO, 0],
    delayMs: startDelayMs + i * intervalMs,
  }))
}

/** Everything to send when a song is opened, in order, with delays relative to the song change. */
export function buildSongMidi(
  song: SongMidiData,
  opts: { channel: number; tempoMode: TempoMode },
): ScheduledMidi[] {
  const out: ScheduledMidi[] = []
  if (song.rig) out.push({ data: rigMessages(song.rig, opts.channel), delayMs: 0 })

  if (opts.tempoMode === 'off' || !isValidTempo(song.bpm)) return out
  const tempoDelay = song.rig ? RIG_LOAD_DELAY_MS : 0
  if (opts.tempoMode === 'nrpn') {
    out.push({ data: tempoNrpnMessages(song.bpm, opts.channel), delayMs: tempoDelay })
  } else {
    out.push(...tapTempoMessages(song.bpm, opts.channel, tempoDelay))
  }
  return out
}

// ─── Bulk rig remapping (Kemper rigs table) ─────────────────────────────────
// After reorganising performances on the Kemper, many songs' rigs need the same
// change: "6.2" → "8.2" for one rig, or "6.*" → "8.*" to move a whole
// performance (each song keeps its slot).

/** A rig as written in `{x_kemper_rig: …}` — "17" or "6.2". */
export function kemperRigValue(rig: KemperRig): string {
  return rig.kind === 'program' ? String(rig.program) : `${rig.performance}.${rig.slot}`
}

/** One rig ("17", "6.2") or every slot of a performance ("6.*"). */
export type KemperRigPattern =
  | { kind: 'rig'; rig: KemperRig }
  | { kind: 'performance'; performance: number }

export function parseKemperRigPattern(value: string): KemperRigPattern | null {
  const all = value.trim().match(/^(\d{1,3})\s*[./]\s*\*$/)
  if (all) {
    const performance = Number(all[1])
    return performance >= 1 && performance <= KEMPER_PERFORMANCES ? { kind: 'performance', performance } : null
  }
  const rig = parseKemperRig(value)
  return rig ? { kind: 'rig', rig } : null
}

export function rigMatchesPattern(rig: KemperRig | null, pattern: KemperRigPattern): boolean {
  if (!rig) return false
  if (pattern.kind === 'performance') return rig.kind === 'performance' && rig.performance === pattern.performance
  return kemperRigValue(rig) === kemperRigValue(pattern.rig)
}

/** Why a from → to remap is invalid; the UI shows it via the i18n key `kemper.remapError.<code>`. */
export type RigRemapError = 'invalidFrom' | 'invalidTo' | 'performanceOnly'

/**
 * Builds the replacement for a from → to remap, or an error code.
 * `to` may be empty (remove the rig). "6.*" → "8.*" keeps each song's slot;
 * "6.*" → "17" puts every slot of performance 6 on one rig.
 */
export function buildRigRemap(
  from: string,
  to: string,
): { from: KemperRigPattern; replace: (rig: KemperRig) => string } | { error: RigRemapError } {
  const fromPattern = parseKemperRigPattern(from)
  if (!fromPattern) return { error: 'invalidFrom' }
  if (!to.trim()) return { from: fromPattern, replace: () => '' }
  const toPattern = parseKemperRigPattern(to)
  if (!toPattern) return { error: 'invalidTo' }
  if (toPattern.kind === 'rig') return { from: fromPattern, replace: () => kemperRigValue(toPattern.rig) }
  if (fromPattern.kind !== 'performance') return { error: 'performanceOnly' }
  return {
    from: fromPattern,
    replace: rig => rig.kind === 'performance' ? `${toPattern.performance}.${rig.slot}` : kemperRigValue(rig),
  }
}
