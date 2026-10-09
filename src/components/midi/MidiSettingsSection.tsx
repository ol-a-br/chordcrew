import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Table2 } from 'lucide-react'
import { useTranslation, Trans } from 'react-i18next'
import type { AppSettings } from '@/types'
import { parseKemperRig, formatKemperRig } from '@/midi/kemper'
import {
  isMidiSupported, getMidiAccess, getMidiAccessError, listOutputs, onMidiPortsChanged, sendMidiTest,
  type MidiOutputInfo,
} from '@/midi/midiService'

interface Props {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div>
        <span className="text-sm">{label}</span>
        {hint && <p className="text-xs text-ink-muted mt-0.5">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Switch({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-chord' : 'bg-surface-3'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// label = i18n key
const TEMPO_MODES = [
  { mode: 'nrpn', label: 'midi.tempoExact' },
  { mode: 'tap',  label: 'midi.tempoTap' },
] as const

/** Settings → MIDI: send each song's Kemper rig + tempo to a Web MIDI output (e.g. CME WIDI Master). */
export function MidiSettingsSection({ settings, update }: Props) {
  const { t } = useTranslation()
  const supported = isMidiSupported()
  const [outputs, setOutputs] = useState<MidiOutputInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [testRig, setTestRig] = useState('')
  const [testBpm, setTestBpm] = useState('120')
  const [testResult, setTestResult] = useState<string | null>(null)

  const refresh = useCallback(async (interactive: boolean) => {
    const access = await getMidiAccess(interactive)
    if (!access) return null
    const list = listOutputs(access)
    setOutputs(list)
    return list
  }, [])

  // List outputs (without prompting) once MIDI is on, and keep the list live.
  useEffect(() => {
    if (!supported || !settings.midiEnabled) return
    refresh(false)
    return onMidiPortsChanged(() => { refresh(false) })
  }, [supported, settings.midiEnabled, refresh])

  const enable = async () => {
    setError(null)
    // The only place that may show the browser's MIDI permission prompt.
    const list = await refresh(true)
    if (!list) {
      const reason = getMidiAccessError()
      setError(reason && !/^(SecurityError|NotAllowedError)\b/.test(reason)
        ? t('midi.accessFailed', { reason })
        : t('midi.accessBlocked') + (reason ? ` (${reason})` : ''))
      return
    }
    const patch: Partial<AppSettings> = { midiEnabled: true }
    if (!settings.midiOutputId) {
      // iOS names Bluetooth MIDI endpoints (e.g. the WIDI) just "Bluetooth" —
      // pick it too, but only when it is the only output.
      const widi = list.find(o => /widi|kemper/i.test(o.name))
        ?? (list.length === 1 && /bluetooth/i.test(list[0].name) ? list[0] : undefined)
      if (widi) Object.assign(patch, { midiOutputId: widi.id, midiOutputName: widi.name })
    }
    await update(patch)
  }

  const selected = outputs.find(o => o.id === settings.midiOutputId)
    ?? outputs.find(o => !!settings.midiOutputName && o.name === settings.midiOutputName)
  const parsedTestRig = parseKemperRig(testRig)

  const runTest = async () => {
    if (testRig.trim() && !parsedTestRig) { setTestResult(t('midi.testRigInvalid')); return }
    const ok = await sendMidiTest({ rig: parsedTestRig, bpm: Number(testBpm) || 0 }, settings)
    setTestResult(ok ? t('midi.testSent') : t('midi.testNoOutput'))
  }

  return (
    <section>
      <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-1">{t('midi.title')}</h2>
      <p className="text-xs text-ink-muted mb-3">
        <Trans i18nKey="midi.intro" components={{ code: <code className="font-mono" /> }} />
      </p>
      <Link
        to="/midi/rigs"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-chord hover:text-chord-light"
      >
        <Table2 size={14} /> {t('midi.editAllRigs')}
      </Link>

      {!supported ? (
        <div className="bg-surface-1 rounded-xl px-4 py-3 text-sm text-ink-muted">
          {t('midi.unsupported')}
        </div>
      ) : (
        <div className="bg-surface-1 rounded-xl px-4 divide-y divide-surface-3">
          <Row label={t('midi.sendOnSongChange')}>
            <Switch
              label={t('midi.sendOnSongChange')}
              checked={settings.midiEnabled}
              onClick={() => settings.midiEnabled ? update({ midiEnabled: false }) : enable()}
            />
          </Row>

          {error && <p className="py-2 text-xs text-red-400">{error}</p>}

          {settings.midiEnabled && (
            <>
              <Row label={t('midi.output')}>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${selected?.connected ? 'bg-green-500' : 'bg-surface-3'}`}
                    title={selected?.connected ? t('midi.connected') : t('midi.notConnected')}
                  />
                  <select
                    aria-label={t('midi.outputLabel')}
                    value={selected?.id ?? ''}
                    onChange={e => {
                      const o = outputs.find(x => x.id === e.target.value)
                      update({ midiOutputId: o?.id ?? '', midiOutputName: o?.name ?? '' })
                    }}
                    className="bg-surface-2 text-sm rounded-lg px-3 py-1.5 border border-surface-3 focus:outline-none max-w-[12rem]"
                  >
                    <option value="">
                      {settings.midiOutputName && !selected ? `${settings.midiOutputName} ${t('midi.offlineSuffix')}` : t('midi.none')}
                    </option>
                    {outputs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}{o.connected ? '' : ` ${t('midi.offlineSuffix')}`}</option>
                    ))}
                  </select>
                </div>
              </Row>

              <Row label={t('midi.channel')}>
                <select
                  aria-label={t('midi.channel')}
                  value={settings.midiChannel}
                  onChange={e => update({ midiChannel: Number(e.target.value) })}
                  className="bg-surface-2 text-sm rounded-lg px-3 py-1.5 border border-surface-3 focus:outline-none"
                >
                  {Array.from({ length: 16 }, (_, i) => i + 1).map(ch => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>
              </Row>

              <Row
                label={t('midi.sendRig')}
                hint={settings.midiSendRig ? undefined : t('midi.sendRigOffHint')}
              >
                <Switch
                  label={t('midi.sendRig')}
                  checked={settings.midiSendRig}
                  onClick={() => update({ midiSendRig: !settings.midiSendRig })}
                />
              </Row>

              <Row label={t('midi.sendTempo')}>
                <Switch
                  label={t('midi.sendTempo')}
                  checked={settings.midiSendTempo}
                  onClick={() => update({ midiSendTempo: !settings.midiSendTempo })}
                />
              </Row>

              {settings.midiSendTempo && <Row label={t('midi.tempoMethod')}>
                <div className="flex gap-0 bg-surface-2 rounded-lg overflow-hidden border border-surface-3">
                  {TEMPO_MODES.map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => update({ midiTempoMode: mode })}
                      className={`px-3 py-1.5 text-sm ${settings.midiTempoMode === mode ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:text-ink'}`}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </Row>}

              <div className="py-3 space-y-2">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-ink-muted">{t('midi.test')}</span>
                  <label className="flex items-center gap-1 text-xs">
                    <span className="text-ink-faint">{t('editor.fieldRig')}</span>
                    <input
                      aria-label={t('midi.testRig')}
                      value={testRig}
                      onChange={e => setTestRig(e.target.value)}
                      placeholder="6.2"
                      className="w-14 bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50 placeholder:text-ink-faint/40"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <span className="text-ink-faint">BPM</span>
                    <input
                      aria-label={t('midi.testBpm')}
                      type="number"
                      value={testBpm}
                      onChange={e => setTestBpm(e.target.value)}
                      className="w-14 bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50"
                    />
                  </label>
                  <button
                    onClick={runTest}
                    className="px-3 py-1 text-xs rounded-lg border border-surface-3 bg-surface-2 text-ink hover:border-chord/50"
                  >
                    {t('midi.send')}
                  </button>
                  {parsedTestRig && <span className="text-xs text-ink-faint">{formatKemperRig(parsedTestRig)}</span>}
                </div>
                {testResult && <p className="text-xs text-ink-muted">{testResult}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
