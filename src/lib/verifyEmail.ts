const KEY = 'ba-verify-email'

export function rememberVerifyEmail(email: string) {
  if (typeof sessionStorage === 'undefined') return
  const clean = email.trim().toLowerCase().slice(0, 320)
  if (!clean) return
  try {
    sessionStorage.setItem(KEY, clean)
  } catch {
    // Private mode can block storage. The verify form still accepts an email.
  }
}

export function readVerifyEmail() {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    return sessionStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function clearVerifyEmail() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Ignore storage failures.
  }
}
