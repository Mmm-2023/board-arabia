// Auth is MAJLIS_CRON_SECRET or the service role. MAJLIS_REMINDERS_ENABLED stays off.
// This function does not call a calendar or meeting API. It does not send unless the flag is the exact string true.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { stableNoticeRef } from '../_shared/member_notice.ts'
import { mailReminder } from '../_shared/majlis_notify.ts'
import { runMajlisReminders } from '../_shared/majlis_reminders.ts'

Deno.serve((req) => {
  const env = (name: string) => Deno.env.get(name)
  const supabaseUrl = env('SUPABASE_URL') ?? ''
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null
  return runMajlisReminders(req, {
    env,
    rpc: async (name, args) => {
      if (!admin) return { data: null, error: { message: 'missing' } }
      const result = await admin.rpc(name, args ?? {})
      return { data: result.data, error: result.error ? { message: 'rpc_failed' } : null }
    },
    mail: async (row) => {
      if (!admin) return { status: 'error', detail: 'missing' }
      const refId = await stableNoticeRef(row.rsvp_id, row.kind)
      const sent = await mailReminder(
        admin,
        row.email,
        row.event,
        row.kind,
        {
          userId: row.member_id,
          refId,
          eventId: row.event.id,
        },
        {
          registered: true,
          audience: row.audience,
          meetReady: row.meet_ready,
          format: row.format,
        },
      )
      return { status: sent.status, detail: sent.detail }
    },
  })
})
