import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/components/auth/LoginPage'

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
  if (loading) return <PageLoader />
  if (!user) return <LoginPage />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <RequireAuth>
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
              <Route path="/import"         element={<ImportPage />} />
              <Route path="/settings"       element={<SettingsPage />} />
              <Route path="*"               element={<Navigate to="/library" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </RequireAuth>
    </BrowserRouter>
  )
}
