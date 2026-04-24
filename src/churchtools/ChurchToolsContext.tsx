import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getSettings, saveSettings } from '@/db'
import { ctLogin, ctWhoAmI, ctGetSongCategories } from './api'
import type { CTCategory } from './types'

interface ChurchToolsContextValue {
  isConfigured: boolean
  baseUrl: string
  token: string
  categoryId: number
  personName: string | null
  categories: CTCategory[]
  connecting: boolean
  connectError: string | null
  connect: (username: string, password: string) => Promise<void>
  disconnect: () => void
  setBaseUrl: (url: string) => Promise<void>
  setCategoryId: (id: number) => Promise<void>
  refreshPerson: () => Promise<void>
}

const ChurchToolsContext = createContext<ChurchToolsContextValue | null>(null)

export function ChurchToolsProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState('')
  const [token, setTokenState] = useState('')
  const [categoryId, setCategoryIdState] = useState(0)
  const [personName, setPersonName] = useState<string | null>(null)
  const [categories, setCategories] = useState<CTCategory[]>([])
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then(s => {
      setBaseUrlState(s.churchToolsUrl ?? '')
      setTokenState(s.churchToolsToken ?? '')
      setCategoryIdState(s.churchToolsCategoryId ?? 0)
    })
  }, [])

  // Verify stored token and load person name + categories on mount
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

  const connect = async (username: string, password: string) => {
    setConnecting(true)
    setConnectError(null)
    try {
      const { token: newToken } = await ctLogin(baseUrl, username, password)
      setTokenState(newToken)
      await saveSettings({ churchToolsToken: newToken })
      const person = await ctWhoAmI(baseUrl, newToken)
      setPersonName(`${person.firstName} ${person.lastName}`.trim())
      const cats = await ctGetSongCategories(baseUrl, newToken)
      setCategories(cats)
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = () => {
    setTokenState('')
    setPersonName(null)
    setCategories([])
    saveSettings({ churchToolsToken: '' })
  }

  const setBaseUrl = async (url: string) => {
    const normalised = url.replace(/\/api\/?$/, '').replace(/\/$/, '')
    setBaseUrlState(normalised)
    setPersonName(null)
    setCategories([])
    await saveSettings({ churchToolsUrl: normalised, churchToolsToken: '' })
    setTokenState('')
  }

  const setCategoryId = async (id: number) => {
    setCategoryIdState(id)
    await saveSettings({ churchToolsCategoryId: id })
  }

  const refreshPerson = async () => {
    if (!baseUrl || !token) return
    try {
      const p = await ctWhoAmI(baseUrl, token)
      setPersonName(`${p.firstName} ${p.lastName}`.trim())
    } catch {
      setPersonName(null)
    }
  }

  return (
    <ChurchToolsContext.Provider value={{
      isConfigured, baseUrl, token, categoryId, personName,
      categories, connecting, connectError,
      connect, disconnect, setBaseUrl, setCategoryId, refreshPerson,
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
