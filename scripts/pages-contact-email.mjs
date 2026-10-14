/** Pages must publish a contact on /account-deletion. No mailbox literal lives here. */
export function pagesContactEmailError(env) {
  if (env.GITHUB_PAGES !== 'true') return ''
  const value = String(env.VITE_LEGAL_CONTACT_EMAIL ?? '').trim()
  if (!value || value === 'To be confirmed' || !value.includes('@')) {
    return 'Pages build requires VITE_LEGAL_CONTACT_EMAIL'
  }
  return ''
}
