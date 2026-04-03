import React, { createContext, useContext, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { firebaseConfigured } from '@/firebase'
import { syncNow as doSync } from './firestoreSync'
import { useAuth } from '@/auth/AuthContext'

export type SyncStatus = 'unconfigured' | 'clean' | 'pending' | 'syncing' | 'error'

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

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(() => {
    const s = localStorage.getItem('chordcrew-last-sync')
    return s ? Number(s) : null
  })

  const pendingCount = useLiveQuery(
    () => db.syncStates.where('status').equals('pending').count(),
    [],
    0
  ) ?? 0

  let status: SyncStatus = 'clean'
  if (!firebaseConfigured) status = 'unconfigured'
  else if (syncing)        status = 'syncing'
  else if (error)          status = 'error'
  else if (pendingCount > 0) status = 'pending'

  const syncNow = useCallback(async () => {
    if (!user || !firebaseConfigured || syncing) return
    setSyncing(true)
    setError(null)
    try {
      await doSync(user.id, user.email)
      const now = Date.now()
      setLastSync(now)
      localStorage.setItem('chordcrew-last-sync', String(now))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [user, syncing])

  return (
    <SyncContext.Provider value={{ status, pendingCount, lastSync, error, syncNow }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  return useContext(SyncContext)
}
