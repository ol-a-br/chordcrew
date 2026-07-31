import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// authDomain must be same-origin with the page being served, or browsers that
// partition third-party storage (all of iOS/WebKit, Firefox with Total Cookie
// Protection) never deliver the signInWithRedirect result back to the app:
// Firebase records the sign-in server-side, but the client silently lands back
// on the login page. The app is reachable on several connected Hosting domains
// (apex, www, *.web.app), and Firebase Hosting serves the reserved /__/auth/*
// endpoints on every one of them — so use the domain actually being served
// whenever it is one of those, and only fall back to the env value elsewhere
// (dev on localhost).
function resolveAuthDomain(): string | undefined {
  const envDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
  if (typeof window === 'undefined' || !envDomain) return envDomain
  const host = window.location.hostname
  const isConnectedHostingDomain =
    host === envDomain ||
    host === `www.${envDomain}` ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com')
  return isConnectedHostingDomain ? host : envDomain
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        resolveAuthDomain(),
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Firebase is optional in Phase 1 (offline-only mode works without it)
export const firebaseConfigured = Boolean(firebaseConfig.apiKey)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
}

export { app, auth, db as firestore }
