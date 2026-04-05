import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { firebaseConfigured } from '@/firebase'
import { syncNow as doSync, checkForCloudUpdates } from './firestoreSync'
import { useAuth } from '@/auth/AuthContext'

export type SyncStatus =
  | 'unconfigured'
  | 'offline'
  | 'clean'
  | 'pending'
  | 'syncing'
  | 'error'
  | 'updates-available'

interface SyncContextValue {
  status: SyncStatus
  pendingCount: number
  lastSync: number | null
  error: string | null
  syncNow: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue>({
  status: 'unconfigured',
  pendingCount: 0,
  lastSync: null,
  error: null,
  syncNow: async () => {},
})

const CHECK_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [hasCloudUpdates, setHasCloudUpdates] = useState(false)
  const [lastSync, setLastSync] = useState<number | null>(() => {
    const s = localStorage.getItem('chordcrew-last-sync')
    return s ? Number(s) : null
  })

  // Ref so the interval callback always sees the current lastSync without stale closure
  const lastSyncRef = useRef(lastSync)
  lastSyncRef.current = lastSync

  const pendingCount = useLiveQuery(
    () => db.syncStates.where('status').equals('pending').count(),
    [],
    0
  ) ?? 0

  // Online / offline detection
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // 5-minute cloud update check (only when Firebase is configured + user is logged in)
  useEffect(() => {
    if (!firebaseConfigured || !user) return

    const check = async () => {
      if (!navigator.onLine) return
      const since = lastSyncRef.current
      if (!since) return  // never synced — nothing to compare against
      try {
        const found = await checkForCloudUpdates(user.id, since)
        if (found) setHasCloudUpdates(true)
      } catch {
        // Ignore — check failures are silent; user can still manually sync
      }
    }

    check()  // run once immediately
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user])

  // Derived status — priority: offline > syncing > error > updates-available > pending > clean
  let status: SyncStatus = 'clean'
  if (!firebaseConfigured)   status = 'unconfigured'
  else if (!isOnline)        status = 'offline'
  else if (syncing)          status = 'syncing'
  else if (error)            status = 'error'
  else if (hasCloudUpdates)  status = 'updates-available'
  else if (pendingCount > 0) status = 'pending'

  const syncNow = useCallback(async () => {
    if (!user || !firebaseConfigured || syncing || !isOnline) return
    setSyncing(true)
    setError(null)
    try {
      await doSync(user.id, user.email)
      const now = Date.now()
      setLastSync(now)
      setHasCloudUpdates(false)
      localStorage.setItem('chordcrew-last-sync', String(now))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [user, syncing, isOnline])

  return (
    <SyncContext.Provider value={{ status, pendingCount, lastSync, error, syncNow }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  return useContext(SyncContext)
}
