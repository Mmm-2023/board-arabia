import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { resolveDueDiligenceUser } from '../_shared/due_diligence_user.ts'
import { assertPptxSlides } from './extract.ts'
import { handleDueDiligenceStart, type DueDiligenceAdmin } from './handle.ts'
import { advanceDueDiligenceJob, deferJob } from './run.ts'

function createAdmin(): DueDiligenceAdmin | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey) as unknown as DueDiligenceAdmin
}

Deno.serve((req) =>
  handleDueDiligenceStart(req, {
    resolveUser: () =>
      resolveDueDiligenceUser({
        authorization: req.headers.get('Authorization'),
        nowMs: Date.now(),
        jwtSecret: Deno.env.get('SUPABASE_JWT_SECRET') ?? '',
        supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
        anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        fetchImpl: globalThis.fetch.bind(globalThis),
      }),
    createAdmin,
    assertSlides: assertPptxSlides,
    scheduleJob: (admin, jobId) => {
      deferJob(advanceDueDiligenceJob(admin as unknown as SupabaseClient, jobId))
    },
  }),
)
