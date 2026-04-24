import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GitFork, RefreshCw, Download, CheckCircle2, Smartphone, Monitor, LogIn, LogOut, Church } from 'lucide-react'
import { db, getSettings, saveSettings } from '@/db'
import { useCaptureKey } from '@/hooks/useKeyboard'
import { Button } from '@/components/shared/Button'
import { useSync } from '@/sync/SyncContext'
import { useChurchTools } from '@/churchtools/ChurchToolsContext'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

// The beforeinstallprompt event is Chrome/Edge-specific and not in standard lib.d.ts
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { status, pendingCount, lastSync, error: syncError, syncNow } = useSync()
  const {
    isConfigured, personName, categories,
    verifying, verifyError,
    baseUrl, saveTokenAndVerify, disconnect, setBaseUrl, setCategoryId, categoryId,
  } = useChurchTools()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [capturingKey, setCapturingKey] = useState<'next' | 'prev' | null>(null)
  const [ctUrlInput, setCtUrlInput] = useState('')
  const [ctTokenInput, setCtTokenInput] = useState('')
  const [showTokenField, setShowTokenField] = useState(false)

  // PWA install state
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  // Platform detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
  const isMacOS = /Mac/.test(navigator.userAgent) && !isIOS
  const isAndroid = /Android/.test(navigator.userAgent)
  const isWindows = /Win/.test(navigator.userAgent)

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s)
      setCtUrlInput(s.churchToolsUrl ?? '')
    })
    // Check if already running as installed PWA
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches)
    // Listen for Chrome/Edge/Android install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
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
            <div className="flex gap-0 bg-surface-2 rounded-lg overflow-hidden border border-surface-3">
              {[1, 2, 3, 4, 5].map(n => (
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

          <Row label="Page navigation">
            <div className="flex gap-0 bg-surface-2 rounded-lg overflow-hidden border border-surface-3">
              <button
                onClick={() => update({ continuousScroll: false })}
                className={`px-3 py-1.5 text-sm ${!settings.continuousScroll ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:text-ink'}`}
              >
                Flip
              </button>
              <button
                onClick={() => update({ continuousScroll: true })}
                className={`px-3 py-1.5 text-sm ${settings.continuousScroll ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:text-ink'}`}
              >
                Scroll
              </button>
            </div>
          </Row>
        </div>
      </section>

      {/* Performance */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Performance</h2>
        <div className="bg-surface-1 rounded-xl px-4 divide-y divide-surface-3">
          <Row label="Metronome">
            <div className="flex gap-0 bg-surface-2 rounded-lg overflow-hidden border border-surface-3">
              {(['light', 'sound', 'both'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => update({ metronomeMode: mode })}
                  className={`px-3 py-1.5 text-sm capitalize ${settings.metronomeMode === mode ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:text-ink'}`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Notes auto-hide">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={Math.round((settings.noteAutoShowMs ?? 2000) / 1000)}
                onChange={e => update({ noteAutoShowMs: Number(e.target.value) * 1000 })}
                className="w-24 accent-chord"
              />
              <span className="text-sm font-mono text-ink-muted w-8 text-right">
                {Math.round((settings.noteAutoShowMs ?? 2000) / 1000)}s
              </span>
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

      {/* Sync */}
      {status !== 'unconfigured' && (
        <section>
          <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Cloud Sync</h2>
          <div className="bg-surface-1 rounded-xl px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    status === 'clean'             ? 'bg-green-500' :
                    status === 'pending'           ? 'bg-amber-400' :
                    status === 'updates-available' ? 'bg-amber-400' :
                    status === 'offline'           ? 'bg-surface-3' :
                    status === 'error'             ? 'bg-red-500'   : 'bg-blue-400 animate-pulse'
                  }`} />
                  <span className="text-sm">
                    {status === 'syncing'           ? 'Syncing…' :
                     status === 'error'             ? 'Sync error' :
                     status === 'pending'           ? `${pendingCount} change${pendingCount !== 1 ? 's' : ''} pending` :
                     status === 'updates-available' ? 'Updates available — tap Sync Now' :
                     status === 'offline'           ? 'Offline' :
                     'Up to date'}
                  </span>
                </div>
                {lastSync && (
                  <p className="text-xs text-ink-faint pl-4">
                    Last synced {new Date(lastSync).toLocaleString()}
                  </p>
                )}
                {syncError && (
                  <p className="text-xs text-red-400 pl-4">{syncError}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={syncNow}
                disabled={status === 'syncing'}
              >
                <RefreshCw size={14} className={status === 'syncing' ? 'animate-spin' : ''} />
                Sync Now
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ChurchTools */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Church size={13} />
          ChurchTools
        </h2>
        <div className="bg-surface-1 rounded-xl px-4 py-3 space-y-3">
          {/* URL row */}
          <div className="space-y-1.5">
            <label className="text-xs text-ink-faint">Church URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={ctUrlInput}
                onChange={e => setCtUrlInput(e.target.value)}
                placeholder="https://mychurch.church.tools"
                className="flex-1 bg-surface-2 rounded-lg px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint border border-surface-3 focus:outline-none focus:ring-1 focus:ring-chord/50"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={!ctUrlInput.trim() || ctUrlInput === baseUrl}
                onClick={() => setBaseUrl(ctUrlInput.trim())}
              >
                Save
              </Button>
            </div>
          </div>

          {/* Connection status */}
          {baseUrl && (
            isConfigured && personName ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Connected as <strong>{personName}</strong>
                </div>
                <Button variant="ghost" size="sm" onClick={disconnect}>
                  <LogOut size={13} />
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {!showTokenField ? (
                  <Button variant="ghost" size="sm" onClick={() => setShowTokenField(true)}>
                    <LogIn size={13} />
                    Enter login token
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-ink-muted leading-relaxed">
                      In ChurchTools: <strong className="text-ink">Your profile → Security → Login tokens</strong> → create a token and paste it here. Your password is never stored.
                    </p>
                    <input
                      type="password"
                      value={ctTokenInput}
                      onChange={e => setCtTokenInput(e.target.value)}
                      placeholder="Paste login token…"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && ctTokenInput.trim()) {
                          saveTokenAndVerify(ctTokenInput)
                          setCtTokenInput('')
                          setShowTokenField(false)
                        }
                      }}
                      className="w-full bg-surface-2 rounded-lg px-3 py-1.5 text-sm font-mono border border-surface-3 focus:outline-none focus:ring-1 focus:ring-chord/50"
                    />
                    {verifyError && (
                      <p className="text-xs text-red-400 leading-relaxed">{verifyError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="primary" size="sm"
                        onClick={() => {
                          saveTokenAndVerify(ctTokenInput)
                          setCtTokenInput('')
                          setShowTokenField(false)
                        }}
                        disabled={verifying || !ctTokenInput.trim()}
                      >
                        {verifying ? 'Verifying…' : 'Save & verify'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setShowTokenField(false); setCtTokenInput('') }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* Category picker */}
          {isConfigured && categories.length > 1 && (
            <div className="flex items-center justify-between pt-1 border-t border-surface-3">
              <span className="text-sm">Default song category</span>
              <select
                value={categoryId}
                onChange={e => setCategoryId(Number(e.target.value))}
                className="bg-surface-2 text-sm rounded-lg px-2 py-1 border border-surface-3 focus:outline-none"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
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

      {/* Install App */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Install App</h2>
        <div className="bg-surface-1 rounded-xl px-4 py-4 space-y-4">
          {isInstalled ? (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 size={16} />
              ChordCrew is installed on this device
            </div>
          ) : deferredPrompt ? (
            // Chrome / Edge / Android Chrome: native install prompt available
            <div className="space-y-2">
              <p className="text-xs text-ink-muted">Install ChordCrew as a native app for offline use, a home screen icon, and no browser chrome.</p>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (!deferredPrompt) return
                  await deferredPrompt.prompt()
                  const { outcome } = await deferredPrompt.userChoice
                  if (outcome === 'accepted') setIsInstalled(true)
                  setDeferredPrompt(null)
                }}
              >
                <Download size={14} />
                Install ChordCrew
              </Button>
            </div>
          ) : isIOS ? (
            // Safari on iPhone / iPad
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Smartphone size={15} className="text-chord" />
                iOS — Safari
              </div>
              <ol className="text-xs text-ink-muted space-y-1.5 list-decimal list-inside">
                <li>Tap the <strong className="text-ink">Share</strong> button (<span className="font-mono">⬆</span>) at the bottom of the screen</li>
                <li>Scroll down and tap <strong className="text-ink">Add to Home Screen</strong></li>
                <li>Tap <strong className="text-ink">Add</strong> to confirm</li>
              </ol>
              <p className="text-xs text-ink-faint">The app must be opened in Safari (not Chrome) for this to work.</p>
            </div>
          ) : isAndroid ? (
            // Android — Chrome without prompt (e.g. already dismissed)
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Smartphone size={15} className="text-chord" />
                Android — Chrome
              </div>
              <ol className="text-xs text-ink-muted space-y-1.5 list-decimal list-inside">
                <li>Tap the <strong className="text-ink">⋮</strong> menu in the top-right corner</li>
                <li>Tap <strong className="text-ink">Add to Home screen</strong> or <strong className="text-ink">Install app</strong></li>
                <li>Tap <strong className="text-ink">Install</strong> to confirm</li>
              </ol>
            </div>
          ) : isMacOS ? (
            // macOS — Safari or Chrome
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Monitor size={15} className="text-chord" />
                macOS
              </div>
              <div className="space-y-2 text-xs text-ink-muted">
                <p><strong className="text-ink">Safari:</strong> File menu → <strong className="text-ink">Add to Dock</strong></p>
                <p><strong className="text-ink">Chrome / Edge:</strong> Click the install icon <span className="font-mono bg-surface-2 px-1 rounded">⊕</span> in the address bar, or open the browser menu → <strong className="text-ink">Install ChordCrew…</strong></p>
              </div>
            </div>
          ) : isWindows ? (
            // Windows — Chrome or Edge
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Monitor size={15} className="text-chord" />
                Windows
              </div>
              <div className="space-y-2 text-xs text-ink-muted">
                <p><strong className="text-ink">Chrome / Edge:</strong> Click the install icon <span className="font-mono bg-surface-2 px-1 rounded">⊕</span> in the address bar, or open the browser menu → <strong className="text-ink">Install ChordCrew…</strong></p>
                <p><strong className="text-ink">Edge:</strong> Click <span className="font-mono bg-surface-2 px-1 rounded">…</span> → Apps → Install this site as an app</p>
              </div>
            </div>
          ) : (
            // Generic fallback
            <div className="space-y-2 text-xs text-ink-muted">
              <p>ChordCrew is a Progressive Web App (PWA). Install it via your browser menu:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong className="text-ink">Chrome / Edge:</strong> address bar install icon or browser menu → Install</li>
                <li><strong className="text-ink">Safari (iOS):</strong> Share → Add to Home Screen</li>
                <li><strong className="text-ink">Safari (macOS):</strong> File → Add to Dock</li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">{t('settings.about')}</h2>
        <div className="bg-surface-1 rounded-xl px-4 divide-y divide-surface-3">
          <Row label={t('settings.version')}>
            <span className="text-sm text-ink-muted font-mono">
              0.1.0 · <span title={__BUILD_TIME__}>{__BUILD_TIME__.slice(0, 10)} {__BUILD_TIME__.slice(11, 16)}Z</span>
            </span>
          </Row>
          <Row label={t('settings.openSource')}>
            <a
              href="https://github.com/ol-a-br/chordcrew"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-chord hover:underline"
            >
              <GitFork size={14} />
              ol-a-br/chordcrew
            </a>
          </Row>
        </div>
      </section>
    </div>
  )
}
