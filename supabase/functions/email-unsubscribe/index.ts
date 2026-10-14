import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { publicSite } from '../_shared/mail.ts'
import { sha256Hex } from '../_shared/bulk_mail.ts'
import { bumpKeyedLimit } from '../_shared/rate_limit.ts'
import { handleUnsubscribe } from './handle.ts'

const HOUR_MS = 60 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return new Response(null, { status: 503 })

  const admin = createClient(supabaseUrl, serviceKey)
  const body = req.method === 'POST' ? await req.text() : ''
  const token = new URL(req.url).searchParams.get('t') || ''
  const forwarded = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || ''
  const tokenKey = `unsub:${await sha256Hex(token || 'none')}`
  const ipKey = `unsub-ip:${await sha256Hex(forwarded || 'none')}`

  const result = await handleUnsubscribe({
    method: req.method,
    url: req.url,
    body,
    siteOrigin: publicSite(),
    limit: async () => {
      const byToken = await bumpKeyedLimit(admin, 'email_unsub_limits', tokenKey, HOUR_MS, 10)
      if (byToken !== 'ok') return byToken
      return bumpKeyedLimit(admin, 'email_unsub_limits', ipKey, HOUR_MS, 30)
    },
    unsubscribe: async (value) => {
      const { error } = await admin.rpc('email_unsubscribe', {
        p_token: value,
        p_source: 'list_unsubscribe_post',
      })
      if (error) throw new Error('unsubscribe_failed')
    },
  })

  const headers = new Headers()
  if (result.location) headers.set('Location', result.location)
  if (result.body) headers.set('Content-Type', 'text/plain; charset=utf-8')
  return new Response(result.body || null, { status: result.status, headers })
})
