import { TRY_AGAIN } from '../_shared/bulk_mail_copy.ts'
import { httpsOrigin } from '../_shared/bulk_mail.ts'
import { ONE_CLICK_BODY } from '../_shared/bulk_mail_copy.ts'

const TOKEN_MAX = 400

export type UnsubscribeResult = {
  status: number
  body: string
  location?: string
}

function tokenFrom(url: string): string {
  try {
    const value = new URL(url).searchParams.get('t') || ''
    if (value.length > TOKEN_MAX) return ''
    return value
  } catch {
    return ''
  }
}

function oneClick(body: string): boolean {
  return body.trim() === ONE_CLICK_BODY
}

export async function handleUnsubscribe(input: {
  method: string
  url: string
  body: string
  siteOrigin: string
  limit: () => Promise<'ok' | 'limited' | 'error'>
  unsubscribe: (token: string) => Promise<void>
}): Promise<UnsubscribeResult> {
  if (input.method !== 'GET' && input.method !== 'POST') {
    return { status: 405, body: '' }
  }
  const limited = await input.limit()
  if (limited !== 'ok') return { status: 429, body: TRY_AGAIN }

  const token = tokenFrom(input.url)
  if (input.method === 'GET') {
    const site = httpsOrigin(input.siteOrigin)
    if (!site) return { status: 404, body: '' }
    const target = `${site}/email/unsubscribe?t=${encodeURIComponent(token)}`
    return { status: 302, body: '', location: target }
  }
  if (!oneClick(input.body) || !token) return { status: 200, body: '' }
  await input.unsubscribe(token)
  return { status: 200, body: '' }
}
