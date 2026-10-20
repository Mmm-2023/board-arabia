import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireStaff } from '../_shared/require_staff.ts'
import { resolveMailStream } from '../_shared/bulk_mail.ts'

/** Read-only stream From addresses. No key is returned. Nothing is sent. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate

  const news = resolveMailStream('news', {
    RESEND_API_KEY: Deno.env.get('RESEND_API_KEY') ?? '',
    EMAIL_FROM: Deno.env.get('EMAIL_FROM') ?? '',
    RESEND_API_KEY_NEWS: Deno.env.get('RESEND_API_KEY_NEWS') ?? '',
    EMAIL_FROM_NEWS: Deno.env.get('EMAIL_FROM_NEWS') ?? '',
    EMAIL_SENDING_PARENT: Deno.env.get('EMAIL_SENDING_PARENT') ?? '',
  })
  const mail = resolveMailStream('mail', {
    RESEND_API_KEY_MAIL: Deno.env.get('RESEND_API_KEY_MAIL') ?? '',
    EMAIL_FROM_MAIL: Deno.env.get('EMAIL_FROM_MAIL') ?? '',
    EMAIL_SENDING_PARENT: Deno.env.get('EMAIL_SENDING_PARENT') ?? '',
  })
  return jsonResponse(req, {
    news_from: news.fromMailbox,
    mail_from: mail.fromMailbox,
  })
})
