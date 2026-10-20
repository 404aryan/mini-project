// Device-local profiles for the landing page. There is no account server: a
// profile and a salted PBKDF2 hash of its password live in this browser's
// localStorage, and sign in checks the password against that stored hash.
// Every storage access is guarded because private windows, blocked site data
// and quota limits all throw from localStorage.

export type LocalAccount = { name: string; email: string }
export type AccountResult = { ok: true; account: LocalAccount } | { ok: false; error: string }

type StoredProfile = LocalAccount & { salt: string; hash: string }

const SESSION_KEY = 'yap-render-account'
const PROFILES_KEY = 'yap-render-profiles'
const HASH_ITERATIONS = 120_000
const STORAGE_ERROR = 'This browser is blocking local storage, so your profile cannot be saved here.'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isAccount(value: unknown): value is LocalAccount {
  if (!value || typeof value !== 'object') return false
  const { name, email } = value as Record<string, unknown>
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 80
    && typeof email === 'string' && EMAIL_PATTERN.test(email) && email.length <= 254
}

function isProfile(value: unknown): value is StoredProfile {
  if (!isAccount(value)) return false
  const { salt, hash } = value as Record<string, unknown>
  return typeof salt === 'string' && /^[0-9a-f]{32}$/.test(salt) && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function readProfiles(): Record<string, StoredProfile> {
  const stored = readJson(PROFILES_KEY)
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
  const profiles: Record<string, StoredProfile> = {}
  for (const [email, profile] of Object.entries(stored as Record<string, unknown>)) {
    if (isProfile(profile) && normalizeEmail(profile.email) === email) profiles[email] = profile
  }
  return profiles
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)))

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: HASH_ITERATIONS }, key, 256)
  return toHex(new Uint8Array(bits))
}

function cryptoAvailable() {
  return typeof crypto !== 'undefined' && !!crypto.subtle
}

/** The signed-in profile, or null when none is saved or the saved value is unusable. */
export function readSignedInAccount(): LocalAccount | null {
  const stored = readJson(SESSION_KEY)
  return isAccount(stored) ? { name: stored.name.trim(), email: stored.email } : null
}

export async function registerLocalAccount(name: string, email: string, password: string): Promise<AccountResult> {
  const account = { name: name.trim().slice(0, 80) || 'Member', email: normalizeEmail(email) }
  if (!isAccount(account)) return { ok: false, error: 'Enter a valid name and email address.' }
  if (password.length < 6) return { ok: false, error: 'Use a password with at least 6 characters.' }
  if (!cryptoAvailable()) return { ok: false, error: 'This browser cannot protect a password here. Open the site over HTTPS or localhost.' }
  const profiles = readProfiles()
  if (profiles[account.email]) return { ok: false, error: 'A profile with this email already exists on this device. Sign in instead.' }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  profiles[account.email] = { ...account, salt: toHex(salt), hash: await hashPassword(password, salt) }
  if (!writeJson(PROFILES_KEY, profiles) || !writeJson(SESSION_KEY, account)) return { ok: false, error: STORAGE_ERROR }
  return { ok: true, account }
}

export async function signInLocalAccount(email: string, password: string): Promise<AccountResult> {
  const profile = readProfiles()[normalizeEmail(email)]
  if (!profile) return { ok: false, error: 'No profile with this email exists on this device. Create one first.' }
  if (!cryptoAvailable()) return { ok: false, error: 'This browser cannot check a password here. Open the site over HTTPS or localhost.' }
  if (await hashPassword(password, fromHex(profile.salt)) !== profile.hash) return { ok: false, error: 'That password does not match this profile.' }
  const account = { name: profile.name, email: profile.email }
  if (!writeJson(SESSION_KEY, account)) return { ok: false, error: STORAGE_ERROR }
  return { ok: true, account }
}

/** Ends the session. Returns false when storage refused the removal. */
export function signOutLocalAccount() {
  try {
    window.localStorage.removeItem(SESSION_KEY)
    return true
  } catch {
    return false
  }
}
