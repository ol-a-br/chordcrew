import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check'

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
let appCheck: AppCheck | null = null

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig)
  appCheck = initAppCheck(app)
  auth = getAuth(app)
  db = getFirestore(app)
  // Dev/test only: point Auth at the local Firebase Auth emulator so the real
  // signInWithRedirect round-trip can be exercised without a Google account
  // (see playwright.auth.config.ts / `npm run test:auth`). Never active in a
  // production bundle.
  const authEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST as string | undefined
  if (import.meta.env.DEV && authEmulatorHost) {
    connectAuthEmulator(auth, authEmulatorHost, { disableWarnings: true })
  }
}

// App Check proves that Firestore and Cloud Function requests come from this
// app rather than from a script reusing the public Firebase config. Enabled
// only when a reCAPTCHA Enterprise site key is configured; enforcement is
// switched on separately (Firebase console for Firestore, ENFORCE_APP_CHECK in
// functions/.env for the Cloud Functions) — see docs/deployment.md.
function initAppCheck(firebaseApp: FirebaseApp): AppCheck | null {
  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined
  if (!siteKey) return null
  // Local dev: reCAPTCHA can't attest localhost, so the SDK prints a debug
  // token to the console once; register it under App Check → Manage debug
  // tokens (or set VITE_APPCHECK_DEBUG_TOKEN to a registered one).
  if (import.meta.env.DEV) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) || true
  }
  return initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    // Offline-first + manual sync: fetch tokens only when a Firebase request
    // actually needs one, never in the background (e.g. during performance mode).
    isTokenAutoRefreshEnabled: false,
  })
}

export { app, auth, appCheck, db as firestore }
