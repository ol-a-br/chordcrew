import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth, firebaseConfigured } from '@/firebase'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  configured: boolean
  signInError: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  configured: false,
  signInError: null,
  signInWithGoogle: async () => {},
  signOut: async () => {},
})

function toAppUser(fb: FirebaseUser): User {
  return {
    id: fb.uid,
    email: fb.email ?? '',
    displayName: fb.displayName ?? fb.email ?? 'Unknown',
    photoURL: fb.photoURL ?? undefined,
  }
}

function mapFirebaseAuthError(code: string): string {
  switch (code) {
    case 'auth/redirect-cancelled-by-user':
      return 'cancelled'
    case 'auth/network-request-failed':
      return 'network'
    case 'auth/unauthorized-domain':
      return 'unauthorized-domain'
    default:
      return 'default'
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [signInError, setSignInError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      // No Firebase config — run in local-only mode with a guest user
      setUser({ id: 'local', email: 'local@chordcrew', displayName: 'Local User' })
      setLoading(false)
      return
    }
    // Pick up the result of a signInWithRedirect call (no-op if we didn't redirect)
    getRedirectResult(auth).catch(err => {
      const code = (err as { code?: string }).code ?? 'unknown'
      // Ignore the benign "no redirect pending" case
      if (code !== 'auth/no-current-user' && code !== 'auth/null-user') {
        console.error('[auth] getRedirectResult failed:', code, err)
        setSignInError(mapFirebaseAuthError(code))
      }
    })
    return onAuthStateChanged(auth, (fb) => {
      setUser(fb ? toAppUser(fb) : null)
      setLoading(false)
    })
  }, [])

  const signInWithGoogle = async () => {
    if (!auth) return
    setSignInError(null)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithRedirect(auth, provider)
      // Page navigates away — nothing runs after this line
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? 'unknown'
      console.error('[auth] signInWithRedirect failed:', code, err)
      setSignInError(mapFirebaseAuthError(code))
    }
  }

  const signOut = async () => {
    if (!auth) return
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, configured: firebaseConfigured, signInError, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
