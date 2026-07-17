import { getSettings, saveSettings } from '@/db'

// Credential Management API key — one entry per ChurchTools host.
// We store the API token as the "password" field so the OS keychain
// (iOS Keychain via Safari, macOS Keychain, Android Credential Manager)
// manages it instead of our own IndexedDB.
function credId(baseUrl: string): string {
  try { return `churchtools:${new URL(baseUrl).hostname}` }
  catch { return 'churchtools:token' }
}

function supportsPasswordCredential(): boolean {
  return (
    typeof window !== 'undefined' &&
    'credentials' in navigator &&
    typeof (window as unknown as Record<string, unknown>)['PasswordCredential'] === 'function'
  )
}

export async function saveToken(baseUrl: string, token: string): Promise<void> {
  if (supportsPasswordCredential()) {
    try {
      // Triggers "Save password?" prompt on iOS/macOS/Android — stores in OS keychain
      const Cred = (window as unknown as { PasswordCredential: new (d: unknown) => Credential })['PasswordCredential']
      const cred = new Cred({ id: credId(baseUrl), name: 'ChurchTools', password: token })
      await navigator.credentials.store(cred)
      // Token is now in the OS keychain; clear it from Dexie
      await saveSettings({ churchToolsToken: '' })
      return
    } catch {
      // CM API not usable in this context — fall through
    }
  }
  // Fallback: persist in Dexie (IndexedDB, sandboxed, encrypted at rest by iOS data-protection)
  await saveSettings({ churchToolsToken: token })
}

export async function loadToken(baseUrl: string): Promise<string | null> {
  if (supportsPasswordCredential()) {
    try {
      const cred = await navigator.credentials.get({
        password: true,
        mediation: 'silent',
      } as CredentialRequestOptions)
      const pc = cred as (Credential & { password?: string }) | null
      if (pc?.password) return pc.password
    } catch {
      // fall through
    }
  }
  const s = await getSettings()
  return s.churchToolsToken || null
}

export async function clearToken(): Promise<void> {
  // preventSilentAccess prevents auto-sign-in on next visit without deleting the entry
  // (full deletion requires browser UI — this is the spec limitation)
  if ('credentials' in navigator) {
    try { await navigator.credentials.preventSilentAccess() } catch { /* ignore */ }
  }
  await saveSettings({ churchToolsToken: '' })
}
