import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { adminNotifyEmail, corsHeaders, jsonResponse, sendEmail } from '../_shared/mail.ts'
import { checklistReminderMail, emailLink, waitlistOwnerMail } from '../_shared/membership_copy.ts'
import { missingRequired, type ChecklistInput } from '../_shared/membership_steps.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('MEMBERSHIP_REMINDER_SECRET')?.trim() || ''
  const header = req.headers.get('x-membership-reminder')?.trim() || ''
  if (!secret || header !== secret) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Not configured' }, 503)
  const admin = createClient(supabaseUrl, serviceKey)

  const dry = new URL(req.url).searchParams.get('dry_run') === '1'
  const checklist = await remindChecklist(admin, dry)
  const waitlist = await remindWaitlist(admin, dry)
  const closed = await closeStaleNeedsInfo(admin, dry)
  return jsonResponse(req, { ok: true, dry_run: dry, checklist, waitlist, closed })
})

async function remindChecklist(admin: ReturnType<typeof createClient>, dry: boolean) {
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('candidates')
    .select(
      'user_id, email, email_verified_at, role, board_seats, company_name, job_title, company_website, linkedin_url, scale_kind, scale_band, sector_tags, vision_tags, statement, cr_number, cr_country, referral_name, invited_by_member_id, investable_capacity_usd, phone',
    )
    .eq('request_state', 'open')
    .is('checklist_reminded_at', null)
    .lt('email_verified_at', cutoff)
    .limit(50)
  if (error || !data) return 0
  let count = 0
  for (const row of data) {
    const missing = missingRequired(rowToInput(row)).map((item) => item.label)
    if (missing.length === 0) continue
    count += 1
    if (dry) continue
    const mail = checklistReminderMail({
      missing,
      dashboardUrl: emailLink('/dashboard/membership', 'checklist-reminder'),
    })
    if (/calendar\.app\.google|nammco/i.test(`${mail.subject}\n${mail.text}`)) continue
    await sendEmail({ to: String(row.email), subject: mail.subject, html: mail.html, text: mail.text })
    await admin.from('candidates').update({ checklist_reminded_at: new Date().toISOString() }).eq('user_id', row.user_id)
  }
  return count
}

async function remindWaitlist(admin: ReturnType<typeof createClient>, dry: boolean) {
  const desk = adminNotifyEmail()
  const { data, error } = await admin
    .from('candidates')
    .select('user_id, full_name, waitlist_revisit_at')
    .eq('request_state', 'waitlisted')
    .lte('waitlist_revisit_at', new Date().toISOString())
    .limit(50)
  if (error || !data) return 0
  let count = 0
  for (const row of data) {
    count += 1
    if (dry || !desk) continue
    const mail = waitlistOwnerMail({
      name: String(row.full_name || 'A candidate'),
      adminUrl: emailLink(`/admin/applications/${row.user_id}`, 'waitlist-revisit'),
    })
    await sendEmail({ to: desk, subject: mail.subject, html: mail.html, text: mail.text })
    const next = new Date(Date.now() + 30 * 86_400_000).toISOString()
    await admin.from('candidates').update({ waitlist_revisit_at: next }).eq('user_id', row.user_id)
  }
  return count
}

async function closeStaleNeedsInfo(admin: ReturnType<typeof createClient>, dry: boolean) {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('candidates')
    .select('user_id')
    .eq('request_state', 'needs_info')
    .lt('needs_info_at', cutoff)
    .limit(50)
  if (error || !data) return 0
  if (dry) return data.length
  let count = 0
  for (const row of data) {
    const { data: result } = await admin.rpc('transition_candidate', {
      p_user_id: row.user_id,
      p_actor: row.user_id,
      p_to: 'closed',
      p_reason: 'not_enough_information',
    })
    if (result?.status === 'ok') count += 1
  }
  return count
}

function rowToInput(row: Record<string, unknown>): ChecklistInput {
  return {
    emailVerified: Boolean(row.email_verified_at),
    role: String(row.role || ''),
    boardSeats: String(row.board_seats || ''),
    companyName: String(row.company_name || ''),
    jobTitle: String(row.job_title || ''),
    companyWebsite: String(row.company_website || ''),
    linkedinUrl: String(row.linkedin_url || ''),
    scaleKind: String(row.scale_kind || ''),
    scaleBand: String(row.scale_band || ''),
    sectorTags: Array.isArray(row.sector_tags) ? row.sector_tags.map(String) : [],
    visionTags: Array.isArray(row.vision_tags) ? row.vision_tags.map(String) : [],
    statement: String(row.statement || ''),
    crNumber: String(row.cr_number || ''),
    crCountry: String(row.cr_country || ''),
    referralName: String(row.referral_name || ''),
    invited: Boolean(row.invited_by_member_id),
    investable: row.investable_capacity_usd == null ? '' : String(row.investable_capacity_usd),
    phone: String(row.phone || ''),
  }
}
