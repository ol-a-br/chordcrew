import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Library, ListMusic, Users, Download, Settings, Menu, X, Music2, RefreshCw } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { useSync } from '@/sync/SyncContext'
import { firebaseConfigured } from '@/firebase'
import { TeamInviteNotification } from '@/components/teams/TeamInviteNotification'
import { clsx } from 'clsx'

const baseNavItems = [
  { to: '/library',  labelKey: 'nav.library',  Icon: Library },
  { to: '/setlists', labelKey: 'nav.setlists', Icon: ListMusic },
]

const bottomNavItems = [
  { to: '/import',   labelKey: 'nav.import',   Icon: Download },
  { to: '/settings', labelKey: 'nav.settings', Icon: Settings },
]

const STALE_MS = 60 * 60 * 1000  // 1 hour

/** Compact sync status dot shown in the sidebar user section. */
function SyncBadge() {
  const { status, pendingCount, lastSync, syncNow } = useSync()

  if (status === 'unconfigured') return null

  // Treat clean-but-stale (never synced or >1 h ago) as a soft pending indicator
  const isStale = status === 'clean' && (lastSync === null || Date.now() - lastSync > STALE_MS)

  const dotClass =
    status === 'syncing'          ? 'bg-blue-400' :
    status === 'error'            ? 'bg-red-500'  :
    (status === 'pending' || isStale) ? 'bg-amber-400' :
    'bg-green-500'

  const label =
    status === 'syncing' ? 'Syncing…' :
    status === 'error'   ? 'Sync error' :
    status === 'pending' ? `${pendingCount} unsynced` :
    isStale              ? 'Sync recommended' :
    'Synced'

  return (
    <button
      onClick={syncNow}
      disabled={status === 'syncing'}
      title={`${label} — click to sync`}
      className="flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-muted transition-colors disabled:cursor-default px-1 py-0.5"
    >
      {status === 'syncing'
        ? <RefreshCw size={10} className="animate-spin text-blue-400" />
        : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      }
      <span>{label}</span>
    </button>
  )
}

export function AppShell() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0 text-ink font-ui">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'fixed lg:static inset-y-0 left-0 z-30 flex flex-col w-56 bg-surface-1 border-r border-surface-3',
        'transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-surface-3">
          <Music2 className="text-chord" size={22} />
          <span className="font-semibold text-lg tracking-tight">ChordCrew</span>
          <button
            className="ml-auto lg:hidden text-ink-muted hover:text-ink"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {baseNavItems.map(({ to, labelKey, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-chord/10 text-chord font-medium'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
              )}
            >
              <Icon size={17} />
              {t(labelKey)}
            </NavLink>
          ))}
          {firebaseConfigured && (
            <NavLink
              to="/teams"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-chord/10 text-chord font-medium'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
              )}
            >
              <Users size={17} />
              Teams
            </NavLink>
          )}
          <div className="pt-2 border-t border-surface-3/50 mt-1">
            {bottomNavItems.map(({ to, labelKey, Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-chord/10 text-chord font-medium'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                )}
              >
                <Icon size={17} />
                {t(labelKey)}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User */}
        {user && (
          <div className="p-3 border-t border-surface-3">
            <div className="flex items-center gap-2.5 mb-1.5">
              {user.photoURL
                ? <img src={user.photoURL} className="w-7 h-7 rounded-full" alt="" />
                : <div className="w-7 h-7 rounded-full bg-chord/20 flex items-center justify-center text-chord text-xs font-bold">
                    {user.displayName[0]}
                  </div>
              }
              <span className="text-xs text-ink-muted truncate">{user.displayName}</span>
            </div>
            <SyncBadge />
            <button
              onClick={signOut}
              className="w-full text-xs text-ink-faint hover:text-ink-muted text-left px-1 mt-1"
            >
              {t('auth.signOut')}
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-surface-3 bg-surface-1">
          <button onClick={() => setSidebarOpen(true)} className="text-ink-muted hover:text-ink">
            <Menu size={20} />
          </button>
          <Music2 className="text-chord" size={18} />
          <span className="font-semibold text-sm">ChordCrew</span>
        </header>

        {/* Team invite notifications */}
        <TeamInviteNotification />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
