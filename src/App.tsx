import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { SyncProvider } from '@/sync/SyncContext'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/components/auth/LoginPage'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'

// Lazy-load pages for better initial load performance
const LibraryPage        = lazy(() => import('@/pages/LibraryPage'))
const EditorPage         = lazy(() => import('@/pages/EditorPage'))
const ViewerPage         = lazy(() => import('@/pages/ViewerPage'))
const PerformancePage    = lazy(() => import('@/pages/PerformancePage'))
const SetlistsPage       = lazy(() => import('@/pages/SetlistsPage'))
const SetlistDetailPage  = lazy(() => import('@/pages/SetlistDetailPage'))
const ImportPage         = lazy(() => import('@/pages/ImportPage'))
const SettingsPage       = lazy(() => import('@/pages/SettingsPage'))
const PrintSongPage      = lazy(() => import('@/pages/PrintSongPage'))
const PrintSetlistPage   = lazy(() => import('@/pages/PrintSetlistPage'))
const TeamsPage          = lazy(() => import('@/pages/TeamsPage'))
const TeamDetailPage     = lazy(() => import('@/pages/TeamDetailPage'))
const CurationPage       = lazy(() => import('@/pages/CurationPage'))
const HelpPage           = lazy(() => import('@/pages/HelpPage'))
const OnboardingPage     = lazy(() => import('@/pages/OnboardingPage'))
const TeamJoinPage       = lazy(() => import('@/pages/TeamJoinPage'))
const SharePage          = lazy(() => import('@/pages/SharePage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full text-ink-muted text-sm">
      <div className="w-5 h-5 border-2 border-chord border-t-transparent rounded-full animate-spin mr-2" />
      Loading…
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const settings = useLiveQuery(() => db.settings.get('app'), [])

  if (loading || settings === undefined) return <PageLoader />

  // Show onboarding on first visit (before login)
  if (!settings?.onboardingDone) {
    return (
      <Suspense fallback={<PageLoader />}>
        <OnboardingPage />
      </Suspense>
    )
  }

  if (!user) return <LoginPage />
  return <>{children}</>
}

/** Wraps routes that require authentication + sync. Public routes bypass this. */
function AuthenticatedRoutes() {
  return (
    <RequireAuth>
      <SyncProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Full-screen performance mode — outside AppShell */}
          <Route path="/perform/:id" element={<PerformancePage />} />

          {/* Print / PDF export — standalone pages (no nav chrome) */}
          <Route path="/print/song/:id"     element={<PrintSongPage />} />
          <Route path="/print/setlist/:id"  element={<PrintSetlistPage />} />

          {/* Main app with sidebar */}
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/library" replace />} />
            <Route path="/library"        element={<LibraryPage />} />
            <Route path="/editor/:id"     element={<EditorPage />} />
            <Route path="/view/:id"       element={<ViewerPage />} />
            <Route path="/setlists"       element={<SetlistsPage />} />
            <Route path="/setlists/:id"   element={<SetlistDetailPage />} />
            <Route path="/teams"           element={<TeamsPage />} />
            <Route path="/teams/:id"      element={<TeamDetailPage />} />
            <Route path="/join/:teamId"   element={<TeamJoinPage />} />
            <Route path="/import"         element={<ImportPage />} />
            <Route path="/curation"       element={<CurationPage />} />
            <Route path="/help"           element={<HelpPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
            <Route path="*"               element={<Navigate to="/library" replace />} />
          </Route>
        </Routes>
      </Suspense>
      </SyncProvider>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  )
}

/** Top-level router: /share is public, everything else requires auth. */
function AppRouter() {
  const location = useLocation()

  // Public share route — no auth required so anonymous recipients can view
  if (location.pathname.startsWith('/share')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SharePage />
      </Suspense>
    )
  }

  return <AuthenticatedRoutes />
}
