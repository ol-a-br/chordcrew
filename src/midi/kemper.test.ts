import { describe, it, expect } from 'vitest'
import {
  parseKemperRig, formatKemperRig, rigMessages, tempoNrpnMessages,
  tapTempoMessages, buildSongMidi, RIG_LOAD_DELAY_MS,
  parseKemperRigPattern, rigMatchesPattern, buildRigRemap, kemperRigValue,
} from './kemper'

describe('parseKemperRig', () => {
  it('parses a plain program number (1–128)', () => {
    expect(parseKemperRig('17')).toEqual({ kind: 'program', program: 17 })
    expect(parseKemperRig(' 1 ')).toEqual({ kind: 'program', program: 1 })
    expect(parseKemperRig('128')).toEqual({ kind: 'program', program: 128 })
  })

  it('parses Performance.Slot notation', () => {
    expect(parseKemperRig('6.2')).toEqual({ kind: 'performance', performance: 6, slot: 2 })
    expect(parseKemperRig('125/5')).toEqual({ kind: 'performance', performance: 125, slot: 5 })
    expect(parseKemperRig('3 . 1')).toEqual({ kind: 'performance', performance: 3, slot: 1 })
  })

  it('rejects out-of-range and malformed values', () => {
    for (const v of [undefined, '', '0', '129', '6.0', '6.6', '126.1', 'abc', '6.2.1', '-3']) {
      expect(parseKemperRig(v), String(v)).toBeNull()
    }
  })
})

describe('formatKemperRig', () => {
  it('describes both notations', () => {
    expect(formatKemperRig({ kind: 'program', program: 17 })).toBe('PC 17')
    expect(formatKemperRig({ kind: 'performance', performance: 6, slot: 2 })).toBe('Perf 6 · Slot 2')
  })
})

describe('rigMessages', () => {
  it('sends a 0-based Program Change on the configured channel', () => {
    expect(rigMessages({ kind: 'program', program: 17 }, 1)).toEqual([0xC0, 16])
    expect(rigMessages({ kind: 'program', program: 1 }, 16)).toEqual([0xCF, 0])
  })

  it('maps Performance/Slot to bank + program (5 slots per performance)', () => {
    // Performance 6 Slot 2 → index 26 → bank 0, PC 26 (documented Kemper example: "PC #27")
    expect(rigMessages({ kind: 'performance', performance: 6, slot: 2 }, 1))
      .toEqual([0xB0, 0, 0, 0xB0, 32, 0, 0xC0, 26])
    // Performance 26 Slot 3 is the last slot of bank 0 (index 127)
    expect(rigMessages({ kind: 'performance', performance: 26, slot: 3 }, 1))
      .toEqual([0xB0, 0, 0, 0xB0, 32, 0, 0xC0, 127])
    // Performance 26 Slot 4 starts bank 1
    expect(rigMessages({ kind: 'performance', performance: 26, slot: 4 }, 1))
      .toEqual([0xB0, 0, 0, 0xB0, 32, 1, 0xC0, 0])
    // Channel 3
    expect(rigMessages({ kind: 'performance', performance: 1, slot: 1 }, 3))
      .toEqual([0xB2, 0, 0, 0xB2, 32, 0, 0xC2, 0])
  })
})

describe('tempoNrpnMessages', () => {
  it('writes Rig Tempo (page 4, param 0) as BPM × 64 and then nulls the NRPN address', () => {
    // 120 × 64 = 7680 = 0x3C << 7 | 0x00
    expect(tempoNrpnMessages(120, 1)).toEqual([
      0xB0, 99, 4,
      0xB0, 98, 0,
      0xB0, 6, 0x3C,
      0xB0, 38, 0x00,
      0xB0, 99, 127,
      0xB0, 98, 127,
    ])
    // 93 × 64 = 5952 → MSB 46, LSB 64
    const msg = tempoNrpnMessages(93, 2)
    expect(msg.slice(6, 12)).toEqual([0xB1, 6, 46, 0xB1, 38, 64])
  })
})

describe('tapTempoMessages', () => {
  it('sends four CC 30 taps one beat apart', () => {
    const taps = tapTempoMessages(120, 1, 300)
    expect(taps).toHaveLength(4)
    expect(taps.map(t => t.data)).toEqual(Array(4).fill([0xB0, 30, 0]))
    expect(taps.map(t => t.delayMs)).toEqual([300, 800, 1300, 1800])
  })
})

describe('buildSongMidi', () => {
  const rig = { kind: 'program', program: 5 } as const

  it('sends the rig first and the tempo after the rig has loaded', () => {
    const out = buildSongMidi({ rig, bpm: 120 }, { channel: 1, tempoMode: 'nrpn' })
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ data: [0xC0, 4], delayMs: 0 })
    expect(out[1].delayMs).toBe(RIG_LOAD_DELAY_MS)
    expect(out[1].data.slice(0, 3)).toEqual([0xB0, 99, 4])
  })

  it('sends the tempo immediately when the song has no rig', () => {
    const out = buildSongMidi({ rig: null, bpm: 90 }, { channel: 1, tempoMode: 'nrpn' })
    expect(out).toHaveLength(1)
    expect(out[0].delayMs).toBe(0)
  })

  it('uses tap tempo when configured', () => {
    const out = buildSongMidi({ rig, bpm: 60 }, { channel: 1, tempoMode: 'tap' })
    expect(out.map(o => o.delayMs)).toEqual([0, 300, 1300, 2300, 3300])
  })

  it('skips the tempo when disabled, missing or out of range', () => {
    expect(buildSongMidi({ rig, bpm: 120 }, { channel: 1, tempoMode: 'off' })).toHaveLength(1)
    expect(buildSongMidi({ rig, bpm: 0 }, { channel: 1, tempoMode: 'nrpn' })).toHaveLength(1)
    expect(buildSongMidi({ rig, bpm: 400 }, { channel: 1, tempoMode: 'nrpn' })).toHaveLength(1)
    expect(buildSongMidi({ rig: null, bpm: 0 }, { channel: 1, tempoMode: 'nrpn' })).toEqual([])
  })
})

describe('extractMeta → kemperRig', () => {
  it('reads the {x_kemper_rig} directive without affecting other metadata', async () => {
    const { extractMeta } = await import('@/utils/chordpro')
    const meta = extractMeta('{title: Song}\n{x_kemper_rig: 6.2}\n{tempo: 120}\n[C]Text')
    expect(meta.kemperRig).toBe('6.2')
    expect(meta.tempo).toBe(120)
    expect(extractMeta('{title: Song}').kemperRig).toBeUndefined()
  })
})

describe('rig remapping', () => {
  const remap = (from: string, to: string, value: string) => {
    const r = buildRigRemap(from, to)
    if ('error' in r) throw new Error(r.error)
    const rig = parseKemperRig(value)
    return rigMatchesPattern(rig, r.from) ? r.replace(rig!) : null
  }

  it('parses rig and whole-performance patterns', () => {
    expect(parseKemperRigPattern('6.*')).toEqual({ kind: 'performance', performance: 6 })
    expect(parseKemperRigPattern(' 12 / * ')).toEqual({ kind: 'performance', performance: 12 })
    expect(parseKemperRigPattern('6.2')).toEqual({ kind: 'rig', rig: { kind: 'performance', performance: 6, slot: 2 } })
    expect(parseKemperRigPattern('17')).toEqual({ kind: 'rig', rig: { kind: 'program', program: 17 } })
    expect(parseKemperRigPattern('126.*')).toBeNull()
    expect(parseKemperRigPattern('*')).toBeNull()
  })

  it('replaces one rig, matching equivalent spellings', () => {
    expect(remap('6.2', '8.3', '6/2')).toBe('8.3')
    expect(remap('6.2', '8.3', '6.1')).toBeNull()
    expect(remap('17', '6.2', '17')).toBe('6.2')
    expect(remap('17', '6.2', '6.2')).toBeNull()
  })

  it('moves a whole performance, keeping each slot', () => {
    expect(remap('6.*', '8.*', '6.4')).toBe('8.4')
    expect(remap('6.*', '8.*', '7.4')).toBeNull()
    expect(remap('6.*', '8.*', '6')).toBeNull()      // program 6 is not performance 6
    expect(remap('6.*', '17', '6.5')).toBe('17')
  })

  it('removes the rig when To is empty', () => {
    expect(remap('6.*', '', '6.1')).toBe('')
  })

  it('rejects invalid combinations', () => {
    expect(buildRigRemap('x', '1')).toHaveProperty('error')
    expect(buildRigRemap('6.2', '8.*')).toHaveProperty('error')
    expect(buildRigRemap('6.2', '200')).toHaveProperty('error')
  })

  it('formats rigs as directive values', () => {
    expect(kemperRigValue({ kind: 'program', program: 17 })).toBe('17')
    expect(kemperRigValue({ kind: 'performance', performance: 6, slot: 2 })).toBe('6.2')
  })
})
