import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { handleWebhook } from './handle.ts'

function header(req: Request, name: string): string | null {
  return req.headers.get(name)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const body = await req.text()
  if (!secret || !supabaseUrl || !serviceKey) return new Response(null, { status: 401 })

  const admin = createClient(supabaseUrl, serviceKey)
  const result = await handleWebhook({
    secret,
    headers: {
      id: header(req, 'svix-id'),
      timestamp: header(req, 'svix-timestamp'),
      signature: header(req, 'svix-signature'),
    },
    body,
    nowMs: Date.now(),
    record: async (event) => {
      const { error } = await admin.rpc('email_record_event', {
        p_message_id: event.messageId,
        p_type: event.type,
        p_email_hash: event.emailHash,
        p_url: event.url,
        p_occurred_at: event.occurredAt,
      })
      if (error) throw new Error('event_not_stored')
    },
  })
  return new Response(null, { status: result.status })
})
