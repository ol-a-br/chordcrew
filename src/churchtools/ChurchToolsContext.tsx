import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getSettings, saveSettings } from '@/db'
import { ctWhoAmI, ctGetSongCategories } from './api'
import { saveToken, loadToken, clearToken } from './credentials'
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
  saveTokenAndVerify: (token: string) => Promise<void>
  disconnect: () => void
  setBaseUrl: (url: string) => Promise<void>
  setCategoryId: (id: number) => Promise<void>
}

const ChurchToolsContext = createContext<ChurchToolsContextValue | null>(null)

export function ChurchToolsProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState('')
  const [token, setTokenState] = useState('')
  const [categoryId, setCategoryIdState] = useState(0)
  const [personName, setPersonName] = useState<string | null>(null)
  const [categories, setCategories] = useState<CTCategory[]>([])
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

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
        if (!cancelled && tok) setTokenState(tok)
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed'
      const isCors = msg.toLowerCase().includes('fetch') || msg === 'Failed to fetch'
      setVerifyError(
        isCors
          ? 'Network error — ChurchTools may not allow cross-origin requests from this domain. Check that CORS is enabled in your ChurchTools administration.'
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
      saveTokenAndVerify, disconnect, setBaseUrl, setCategoryId,
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
