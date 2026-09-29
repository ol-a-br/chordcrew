/**
 * MIDI out (Kemper Profiler) — a song change sends the song's rig + tempo.
 *
 *   MIDI-1  Opening a song in performance mode sends Bank Select + Program Change,
 *           then the exact NRPN tempo 300 ms later
 *   MIDI-2  Advancing to the next setlist song sends that song's rig + tempo
 *   MIDI-3  Viewer → Present on the same song sends only once
 *   MIDI-4  With MIDI disabled in Settings nothing is sent
 *   MIDI-5  Settings: enabling MIDI auto-selects the WIDI output
 *   MIDI-6  Settings: browsers without Web MIDI get an explanation instead of controls
 *   MIDI-7  Editor: the Rig field writes {x_kemper_rig} and shows how it is read
 *   MIDI-8  Editor: the Rig field is hidden while MIDI is off
 *   MIDI-9  Settings: works with the iOS "Web MIDI Browser" polyfill
 *
 * Web MIDI is replaced by an in-page mock (see mockWebMidi) that records every
 * send(data, timestamp), so no device or permission prompt is involved.
 *
 * Run: npx playwright test --project=chromium tests/midi.spec.ts
 */

import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { randomUUID } from 'crypto'

interface Sent { data: number[]; ts: number }

const NRPN_TEMPO_120 = [0xB0, 99, 4, 0xB0, 98, 0, 0xB0, 6, 60, 0xB0, 38, 0, 0xB0, 99, 127, 0xB0, 98, 127]
const NRPN_TEMPO_90  = [0xB0, 99, 4, 0xB0, 98, 0, 0xB0, 6, 45, 0xB0, 38, 0, 0xB0, 99, 127, 0xB0, 98, 127]

/** Replaces navigator.requestMIDIAccess with one fake "WIDI Master" output that records sends. */
async function mockWebMidi(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __midiSent: { data: number[]; ts: number }[] }
    w.__midiSent = []
    class FakeOutput extends EventTarget {
      id = 'widi-1'; name = 'WIDI Master'; manufacturer = 'CME'; version = '1'
      type = 'output'; state = 'connected'; connection = 'open'
      send(data: number[], ts?: number) { w.__midiSent.push({ data: Array.from(data), ts: ts ?? 0 }) }
      open() { return Promise.resolve(this) }
      close() { return Promise.resolve(this) }
      clear() {}
    }
    class FakeAccess extends EventTarget {
      inputs = new Map()
      outputs = new Map([['widi-1', new FakeOutput()]])
      sysexEnabled = false
    }
    const access = new FakeAccess()
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: () => Promise.resolve(access),
    })
    const permissions = navigator.permissions
    if (permissions) {
      const query = permissions.query.bind(permissions)
      permissions.query = ((desc: PermissionDescriptor) =>
        desc?.name === ('midi' as PermissionName)
          ? Promise.resolve({ state: 'granted' } as PermissionStatus)
          : query(desc)) as typeof permissions.query
    }
  })
}

async function waitForApp(page: Page) {
  await page.goto('/')
  const langBtn = page.locator('button').filter({ hasText: 'English' }).first()
  const onboarding = await langBtn.waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true).catch(() => false)
  if (onboarding) {
    await langBtn.click()
    await page.locator('button').filter({ hasText: /local mode/i }).first().click()
    await page.locator('button').filter({ hasText: /^Skip$/i }).first().click()
    await page.waitForURL(/\/library/, { timeout: 8000 })
  }
  await page.locator('aside').first().waitFor({ state: 'attached', timeout: 8000 })
}

interface Setup { setlistId: string; songA: string; songB: string }

/** Two songs with rigs and tempos in one setlist, plus the MIDI settings. */
async function seed(page: Page, midiEnabled: boolean): Promise<Setup> {
  const d = {
    bookId: randomUUID(), songA: randomUUID(), songB: randomUUID(),
    setlistId: randomUUID(), now: Date.now(), midiEnabled,
    contentA: '{title: Alpha}\n{x_kemper_rig: 6.2}\n{tempo: 120}\n\n[G]Short [C]song [G]content\n',
    contentB: '{title: Beta}\n{x_kemper_rig: 17}\n{tempo: 90}\n\n[D]Another [A]short [D]song\n',
  }
  await page.evaluate((d) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('ChordCrewDB')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(['books', 'songs', 'setlists', 'setlistItems', 'settings'], 'readwrite')
      tx.onerror = () => reject(tx.error)
      tx.oncomplete = () => resolve()
      tx.objectStore('books').put({
        id: d.bookId, title: 'MIDI Book', author: 'Test', ownerId: 'local',
        readOnly: false, shareable: false, createdAt: d.now, updatedAt: d.now,
      })
      const song = (id: string, title: string, content: string, tempo: number) => ({
        id, bookId: d.bookId, title, artist: '', tags: [], searchText: title.toLowerCase(),
        isFavorite: false, savedAt: d.now, updatedAt: d.now,
        transcription: {
          content, key: 'G', capo: 0, tempo, timeSignature: '4/4', duration: 0,
          chordNotation: 'standard', instrument: 'guitar', tuning: 'standard', format: 'chordpro',
        },
      })
      tx.objectStore('songs').put(song(d.songA, 'Alpha', d.contentA, 120))
      tx.objectStore('songs').put(song(d.songB, 'Beta', d.contentB, 90))
      tx.objectStore('setlists').put({
        id: d.setlistId, name: 'MIDI Setlist', ownerId: 'local', createdAt: d.now, updatedAt: d.now,
      })
      tx.objectStore('setlistItems').put({ id: crypto.randomUUID(), setlistId: d.setlistId, order: 0, type: 'song', songId: d.songA, transposeOffset: 0 })
      tx.objectStore('setlistItems').put({ id: crypto.randomUUID(), setlistId: d.setlistId, order: 1, type: 'song', songId: d.songB, transposeOffset: 0 })
      const settings = tx.objectStore('settings')
      const get = settings.get('app')
      get.onsuccess = () => settings.put({
        ...(get.result ?? { id: 'app' }),
        midiEnabled: d.midiEnabled, midiOutputId: 'widi-1', midiOutputName: 'WIDI Master',
        midiChannel: 1, midiTempoMode: 'nrpn',
      })
    }
  }), d)
  return { setlistId: d.setlistId, songA: d.songA, songB: d.songB }
}

const sent = (page: Page) => page.evaluate(() =>
  (window as unknown as { __midiSent: Sent[] }).__midiSent)

async function openPerformance(page: Page, s: Setup, songId: string, pos: number) {
  await page.goto(`/perform/${songId}?setlistId=${s.setlistId}&pos=${pos}`)
  await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('MIDI out — Kemper rig + tempo on song change', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebMidi(page)
    await waitForApp(page)
  })

  test('MIDI-1: performance mode sends bank + program change, then the NRPN tempo', async ({ page }) => {
    const s = await seed(page, true)
    await openPerformance(page, s, s.songA, 0)

    await expect.poll(async () => (await sent(page)).length).toBe(2)
    const [rig, tempo] = await sent(page)
    // Performance 6 Slot 2 → bank 0, program 26
    expect(rig.data).toEqual([0xB0, 0, 0, 0xB0, 32, 0, 0xC0, 26])
    expect(tempo.data).toEqual(NRPN_TEMPO_120)
    expect(tempo.ts - rig.ts).toBeCloseTo(300, 0)
  })

  test('MIDI-2: advancing to the next setlist song sends its rig + tempo', async ({ page }) => {
    const s = await seed(page, true)
    await openPerformance(page, s, s.songA, 0)
    await expect.poll(async () => (await sent(page)).length).toBe(2)

    // Song Alpha fits on one screen → the pedal's "next" goes to song Beta
    await page.keyboard.press('ArrowRight')
    await page.waitForURL(new RegExp(`/perform/${s.songB}`))

    await expect.poll(async () => (await sent(page)).length).toBe(4)
    const all = await sent(page)
    expect(all[2].data).toEqual([0xC0, 16])     // program 17
    expect(all[3].data).toEqual(NRPN_TEMPO_90)
  })

  test('MIDI-3: viewer → present on the same song sends only once', async ({ page }) => {
    const s = await seed(page, true)
    await page.goto(`/view/${s.songA}?setlistId=${s.setlistId}&pos=0`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
    await expect.poll(async () => (await sent(page)).length).toBe(2)

    await page.getByRole('button', { name: /Present/ }).click()
    await page.waitForURL(new RegExp(`/perform/${s.songA}`))
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(800)
    expect(await sent(page)).toHaveLength(2)
  })

  test('MIDI-4: nothing is sent while MIDI is disabled', async ({ page }) => {
    const s = await seed(page, false)
    await openPerformance(page, s, s.songA, 0)
    await page.waitForTimeout(800)
    expect(await sent(page)).toHaveLength(0)
  })

  test('MIDI-5: enabling MIDI in Settings selects the WIDI output', async ({ page }) => {
    await page.goto('/settings')
    const toggle = page.getByRole('switch', { name: 'Send MIDI on song change' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    const output = page.getByRole('combobox', { name: 'MIDI output' })
    await expect(output).toHaveValue('widi-1')

    await page.getByRole('textbox', { name: 'Test rig' }).fill('17')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('Sent.')).toBeVisible()
    const all = await sent(page)
    expect(all[0].data).toEqual([0xC0, 16])
    expect(all[1].data).toEqual(NRPN_TEMPO_120)
  })
})

test.describe('MIDI — editor rig field', () => {
  test.beforeEach(async ({ page }) => { await waitForApp(page) })

  test('MIDI-7: the Rig field writes {x_kemper_rig} and explains the value', async ({ page }) => {
    const s = await seed(page, true)
    await page.goto(`/editor/${s.songB}`)
    const rig = page.getByTitle(/Kemper rig sent on song change/)
    await expect(rig).toHaveValue('17')
    await expect(page.getByText('PC 17')).toBeVisible()

    await rig.fill('6.2')
    await rig.press('Enter')
    await expect(page.getByText('Perf 6 · Slot 2')).toBeVisible()
    await expect.poll(() => page.evaluate((id) => new Promise<string>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const get = req.result.transaction('songs').objectStore('songs').get(id)
        get.onsuccess = () => resolve(get.result.transcription.content)
      }
    }), s.songB), { timeout: 5000 }).toContain('{x_kemper_rig: 6.2}')
  })

  test('MIDI-8: the Rig field is hidden while MIDI is off', async ({ page }) => {
    const s = await seed(page, false)
    await page.goto(`/editor/${s.songB}`)
    await expect(page.getByTitle('Tap tempo')).toBeVisible()
    await expect(page.getByTitle(/Kemper rig sent on song change/)).toHaveCount(0)
  })
})

test('MIDI-6: browsers without Web MIDI get an explanation instead of controls', async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate Safari: no Web MIDI API at all
    delete (Navigator.prototype as unknown as Record<string, unknown>).requestMIDIAccess
  })
  await waitForApp(page)
  await page.goto('/settings')
  await expect(page.getByText(/can't send MIDI/)).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Send MIDI on song change' })).toHaveCount(0)
})

test('MIDI-9: works with the iOS "Web MIDI Browser" polyfill (non-chainable then, non-iterable port map)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __midiSent: number[][] }
    w.__midiSent = []
    // Mirrors mizuhiki/WebMIDIAPIShimForiOS: then() only stores the callbacks and
    // returns undefined; values() returns an iterator without Symbol.iterator;
    // port ids are numbers.
    const output = {
      // Numeric CoreMIDI id; iOS names Bluetooth MIDI endpoints "Bluetooth"
      id: -1523, name: 'Bluetooth', manufacturer: 'CME', type: 'output',
      state: 'connected', connection: 'closed',
      send(data: number[]) { w.__midiSent.push(Array.from(data)) },
    }
    const outputs = {
      size: 1,
      forEach(cb: (o: typeof output) => void) { cb(output) },
      values() { let done = false; return { next: () => done ? { value: undefined, done } : (done = true, { value: output, done: false }) } },
      get: (id: string) => id === output.id ? output : undefined,
    }
    const access = { inputs: { size: 0, forEach() {} }, outputs, sysexEnabled: false, onstatechange: null, addEventListener() {} }
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: () => ({ then(accept: (a: unknown) => void) { setTimeout(() => accept(access), 10) } }),
    })
  })
  await waitForApp(page)
  await page.goto('/settings')
  const toggle = page.getByRole('switch', { name: 'Send MIDI on song change' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/MIDI access/)).toHaveCount(0)

  const select = page.getByRole('combobox', { name: 'MIDI output' })
  await select.selectOption({ label: 'Bluetooth' })
  await expect(select).toHaveValue('-1523')
  await page.getByRole('textbox', { name: 'Test rig' }).fill('17')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Sent.')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __midiSent: number[][] }).__midiSent.length)).toBeGreaterThan(0)
})
