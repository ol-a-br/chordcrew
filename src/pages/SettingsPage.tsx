import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Github } from 'lucide-react'
import { db, getSettings, saveSettings } from '@/db'
import { useCaptureKey } from '@/hooks/useKeyboard'
import { Button } from '@/components/shared/Button'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [capturingKey, setCapturingKey] = useState<'next' | 'prev' | null>(null)

  useEffect(() => {
    getSettings().then(setSettings)
  }, [])

  const update = async (patch: Partial<AppSettings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    await saveSettings(patch)
    if (patch.language) {
      i18n.changeLanguage(patch.language)
      localStorage.setItem('chordcrew-lang', patch.language)
    }
  }

  // Key capture for pedal reassignment
  useCaptureKey(capturingKey !== null, (key) => {
    if (capturingKey === 'next') update({ pedalKeyNext: key })
    else if (capturingKey === 'prev') update({ pedalKeyPrev: key })
    setCapturingKey(null)
  })

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-3 border-b border-surface-3">
      <span className="text-sm">{label}</span>
      <div>{children}</div>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
      <h1 className="text-lg font-semibold">{t('settings.title')}</h1>

      {/* Display */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Display</h2>
        <div className="bg-surface-1 rounded-xl px-4 divide-y divide-surface-3">
          <Row label={t('settings.language')}>
            <select
              value={settings.language}
              onChange={e => update({ language: e.target.value as 'en' | 'de' })}
              className="bg-surface-2 text-sm rounded-lg px-3 py-1.5 border border-surface-3 focus:outline-none"
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </Row>

          <Row label={t('settings.defaultColumns')}>
            <div className="flex gap-1 bg-surface-2 rounded-lg overflow-hidden border border-surface-3">
              {([1, 2, 3] as const).map(n => (
                <button
                  key={n}
                  onClick={() => update({ defaultColumnCount: n })}
                  className={`px-3 py-1.5 text-sm ${settings.defaultColumnCount === n ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:text-ink'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Row>
        </div>
      </section>

      {/* Pedal */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-1">Bluetooth Pedal</h2>
        <p className="text-xs text-ink-muted mb-3">
          PageFlip Cicada V7: set pedal to <strong>Mode 2 (Left/Right Arrow)</strong>.
          Click a button below to reassign.
        </p>
        <div className="bg-surface-1 rounded-xl px-4 divide-y divide-surface-3">
          <Row label={t('settings.pedalNext')}>
            <button
              onClick={() => setCapturingKey('next')}
              className={`font-mono text-sm px-3 py-1.5 rounded-lg border min-w-[100px] text-center
                ${capturingKey === 'next'
                  ? 'border-chord text-chord animate-pulse bg-chord/10'
                  : 'border-surface-3 bg-surface-2 text-ink hover:border-chord/50'}`}
            >
              {capturingKey === 'next' ? 'Press key…' : settings.pedalKeyNext}
            </button>
          </Row>
          <Row label={t('settings.pedalPrev')}>
            <button
              onClick={() => setCapturingKey('prev')}
              className={`font-mono text-sm px-3 py-1.5 rounded-lg border min-w-[100px] text-center
                ${capturingKey === 'prev'
                  ? 'border-chord text-chord animate-pulse bg-chord/10'
                  : 'border-surface-3 bg-surface-2 text-ink hover:border-chord/50'}`}
            >
              {capturingKey === 'prev' ? 'Press key…' : settings.pedalKeyPrev}
            </button>
          </Row>
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Data</h2>
        <div className="bg-surface-1 rounded-xl px-4 py-3 space-y-3">
          <p className="text-xs text-ink-muted">
            Clear all local data. This cannot be undone unless you have synced to the cloud.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              if (!confirm('Delete ALL local songs, setlists, and books?')) return
              await db.delete()
              window.location.reload()
            }}
          >
            Clear local database
          </Button>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">{t('settings.about')}</h2>
        <div className="bg-surface-1 rounded-xl px-4 divide-y divide-surface-3">
          <Row label={t('settings.version')}>
            <span className="text-sm text-ink-muted font-mono">0.1.0</span>
          </Row>
          <Row label={t('settings.openSource')}>
            <a
              href="https://github.com/ol-a-br/chordcrew"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-chord hover:underline"
            >
              <Github size={14} />
              ol-a-br/chordcrew
            </a>
          </Row>
        </div>
      </section>
    </div>
  )
}
