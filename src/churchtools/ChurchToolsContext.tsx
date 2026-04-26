import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getSettings, saveSettings } from '@/db'
import { ctWhoAmI, ctGetSongCategories } from './api'
import { saveToken, loadToken, clearToken } from './credentials'
import { syncCtSongs, type CtSyncResult } from './ctBookSync'
import { useAuth } from '@/auth/AuthContext'
import type { CTCategory } from './types'

interface ChurchToolsContextValue {
  isConfigured: boolean
  baseUrl: string
  token: string
  categoryId: number
  personName: string | null
  categories: CTCategory[]
  verifying: boolean
  verifyError: string | null
  ctSyncing: boolean
  ctLastSync: number | null
  ctSyncResult: CtSyncResult | null
  ctSyncError: string | null
  saveTokenAndVerify: (token: string) => Promise<void>
  disconnect: () => void
  setBaseUrl: (url: string) => Promise<void>
  setCategoryId: (id: number) => Promise<void>
  syncCtBook: () => Promise<void>
}

const ChurchToolsContext = createContext<ChurchToolsContextValue | null>(null)

export function ChurchToolsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [baseUrl, setBaseUrlState] = useState('')
  const [token, setTokenState] = useState('')
  const [categoryId, setCategoryIdState] = useState(0)
  const [personName, setPersonName] = useState<string | null>(null)
  const [categories, setCategories] = useState<CTCategory[]>([])
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [ctSyncing, setCtSyncing] = useState(false)
  const [ctLastSync, setCtLastSync] = useState<number | null>(null)
  const [ctSyncResult, setCtSyncResult] = useState<CtSyncResult | null>(null)
  const [ctSyncError, setCtSyncError] = useState<string | null>(null)
  const [readyToSync, setReadyToSync] = useState(false)

  // Load persisted URL + category; then load token from credential store
  useEffect(() => {
    let cancelled = false
    getSettings().then(async s => {
      if (cancelled) return
      const url = s.churchToolsUrl ?? ''
      const catId = s.churchToolsCategoryId ?? 0
      setBaseUrlState(url)
      setCategoryIdState(catId)
      if (url) {
        const tok = await loadToken(url)
        if (!cancelled && tok) {
          setTokenState(tok)
          setReadyToSync(true)
        }
      }
    })
    return () => { cancelled = true }
  }, [])

  // Verify token and refresh person + categories whenever baseUrl or token changes
  useEffect(() => {
    if (!baseUrl || !token) { setPersonName(null); setCategories([]); return }
    ctWhoAmI(baseUrl, token)
      .then(p => setPersonName(`${p.firstName} ${p.lastName}`.trim()))
      .catch(() => setPersonName(null))
    ctGetSongCategories(baseUrl, token)
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [baseUrl, token])

  const isConfigured = !!baseUrl && !!token

  const syncCtBook = useCallback(async () => {
    if (!baseUrl || !token || !user) return
    setCtSyncing(true)
    setCtSyncError(null)
    try {
      const result = await syncCtSongs(user.id, user.displayName, baseUrl, token, categoryId)
      setCtSyncResult(result)
      setCtLastSync(Date.now())
    } catch (e) {
      setCtSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setCtSyncing(false)
    }
  }, [baseUrl, token, categoryId, user])

  // Auto-sync on app start when credentials are already loaded
  useEffect(() => {
    if (readyToSync && baseUrl && token && user) {
      syncCtBook()
      setReadyToSync(false)
    }
  }, [readyToSync, baseUrl, token, user, syncCtBook])

  const saveTokenAndVerify = async (rawToken: string) => {
    const tok = rawToken.trim()
    setVerifying(true)
    setVerifyError(null)
    try {
      const person = await ctWhoAmI(baseUrl, tok)
      setPersonName(`${person.firstName} ${person.lastName}`.trim())
      await saveToken(baseUrl, tok)
      setTokenState(tok)
      const cats = await ctGetSongCategories(baseUrl, tok)
      setCategories(cats)
      // Trigger initial sync after first successful token verification
      if (user) {
        setCtSyncing(true)
        setCtSyncError(null)
        syncCtSongs(user.id, user.displayName, baseUrl, tok, categoryId)
          .then(result => { setCtSyncResult(result); setCtLastSync(Date.now()) })
          .catch(e => { setCtSyncError(e instanceof Error ? e.message : 'Sync failed') })
          .finally(() => setCtSyncing(false))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed'
      setVerifyError(
        msg === 'Failed to fetch'
          ? 'Could not reach the proxy — make sure the app is deployed or the Functions emulator is running.'
          : msg,
      )
    } finally {
      setVerifying(false)
    }
  }

  const disconnect = async () => {
    setTokenState('')
    setPersonName(null)
    setCategories([])
    setCtLastSync(null)
    setCtSyncResult(null)
    await clearToken()
  }

  const setBaseUrl = async (url: string) => {
    const normalised = url.replace(/\/api\/?$/, '').replace(/\/$/, '')
    setBaseUrlState(normalised)
    setPersonName(null)
    setCategories([])
    setTokenState('')
    await saveSettings({ churchToolsUrl: normalised })
    await clearToken()
  }

  const setCategoryId = async (id: number) => {
    setCategoryIdState(id)
    await saveSettings({ churchToolsCategoryId: id })
  }

  return (
    <ChurchToolsContext.Provider value={{
      isConfigured, baseUrl, token, categoryId, personName,
      categories, verifying, verifyError,
      ctSyncing, ctLastSync, ctSyncResult, ctSyncError,
      saveTokenAndVerify, disconnect, setBaseUrl, setCategoryId, syncCtBook,
    }}>
      {children}
    </ChurchToolsContext.Provider>
  )
}

export function useChurchTools(): ChurchToolsContextValue {
  const ctx = useContext(ChurchToolsContext)
  if (!ctx) throw new Error('useChurchTools must be used inside ChurchToolsProvider')
  return ctx
}
