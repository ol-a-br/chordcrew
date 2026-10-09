import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RotateCw, Library } from 'lucide-react'

/**
 * Last line of defence against a blank screen. Without it, any error thrown
 * while React renders or updates the page (a bug, a stale code chunk after a
 * deploy, a browser extension tampering with the DOM) unmounts the whole app
 * and leaves an empty page — on stage, with no way back but closing the app.
 *
 * Shows a recovery screen instead. Reloading re-opens the same URL, so in
 * performance mode it returns to the same song. No network calls, no toasts
 * (stage-safe); the error only goes to the console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ChordCrew crashed:', error, info.componentStack)
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children
  }
}

function CrashScreen() {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center bg-surface-0 text-ink font-ui"
    >
      <AlertTriangle size={36} className="text-chord" />
      <h1 className="text-lg font-semibold">{t('crash.title')}</h1>
      <p className="text-sm text-ink-muted max-w-sm">{t('crash.message')}</p>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-chord text-surface-0 text-sm font-medium"
        >
          <RotateCw size={15} />
          {t('crash.reload')}
        </button>
        <button
          onClick={() => window.location.assign('/library')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 border border-surface-3 text-sm"
        >
          <Library size={15} />
          {t('crash.toLibrary')}
        </button>
      </div>
    </div>
  )
}
