/**
 * Shared helpers for the emulator-backed security tests (npm run test:firebase).
 * Each test user is a separate Firebase client app signed in through the Auth
 * emulator, so Firestore rules and callable functions see a real ID token.
 */

import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'

export const PROJECT = 'demo-chordcrew'
export const REGION = 'europe-west1'

const [firestoreHost, firestorePort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
export const FUNCTIONS_ORIGIN = 'http://127.0.0.1:5001'
export const FIRESTORE = { host: firestoreHost, port: Number(firestorePort) }

export interface TestUser {
  uid: string
  db: Firestore
  idToken: () => Promise<string>
  call: <T = unknown>(name: string, data?: unknown) => Promise<T>
}

const apps: FirebaseApp[] = []
let counter = 0

/**
 * Create a client for a Google user with the given uid/email, or an
 * unauthenticated client when `sub` is null. `verified: false` simulates an
 * account whose email address is not verified.
 */
export async function testUser(sub: string | null, email = `${sub}@example.com`, verified = true): Promise<TestUser> {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: PROJECT, authDomain: '127.0.0.1' }, `test-${counter++}`)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, FIRESTORE.host, FIRESTORE.port)
  const fns = getFunctions(app, REGION)
  connectFunctionsEmulator(fns, '127.0.0.1', 5001)

  if (sub) {
    // The Auth emulator accepts an unsigned JSON "Google ID token".
    const credential = GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: verified, name: sub }))
    await signInWithCredential(auth, credential)
  }

  return {
    uid: auth.currentUser?.uid ?? '',
    db,
    idToken: async () => auth.currentUser ? auth.currentUser.getIdToken() : '',
    call: async <T>(name: string, data: unknown = {}) => (await httpsCallable(fns, name)(data)).data as T,
  }
}

export async function cleanupUsers(): Promise<void> {
  await Promise.all(apps.splice(0).map(app => deleteApp(app)))
}
