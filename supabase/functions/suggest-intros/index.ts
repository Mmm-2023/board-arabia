import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { gmailCredentialsPresent, jsonResponse, logEmailEvent, publicSite, sendEmail } from '../_shared/mail.ts'
import {
  INTROS_SCHEDULE_HEADER,
  INTROS_SCHEDULE_SECRET,
  isExampleMemberName,
  meetIntroNudgeMail,
  pendingIntroNudgeMail,
  isoWeekParts,
  planIntroWeek,
  runSuggestIntros,
  scheduleAuthorized,
  type PlanIntro,
  type PlanMember,
  type PlannedSuggestion,
} from '../_shared/suggest_intros.ts'

type MemberRow = {
  user_id?: string
  email?: string | null
  status?: string
  seat?: string
  is_demo?: boolean
}

type ProfileRow = {
  user_id?: string
  full_name?: string | null
  sector_tags?: string[] | null
  vision_themes?: string[] | null
  location?: string | null
}

type IntroRow = {
  id?: string
  requester_id?: string
  target_id?: string
  status?: string
  requested_at?: string
  decided_at?: string | null
  pending_nudge_sent_at?: string | null
  meet_nudge_requester_sent_at?: string | null
  meet_nudge_target_sent_at?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': `authorization, content-type, ${INTROS_SCHEDULE_HEADER}`,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const secret = Deno.env.get(INTROS_SCHEDULE_SECRET) ?? ''
  const header = req.headers.get(INTROS_SCHEDULE_HEADER) ?? ''
  if (!scheduleAuthorized(secret, header)) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const now = new Date()
  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1'
  const loaded = await loadPlanInputs(admin, now)
  if (!loaded) return jsonResponse(req, { error: 'Could not read introductions.' }, 500)

  const plan = planIntroWeek({
    now,
    weekAlreadyHasSuggestions: loaded.weekCount > 0,
    members: loaded.members,
    intros: loaded.intros,
  })
  const site = publicSite()
  const pendingMail = pendingIntroNudgeMail(site)
  const meetMail = meetIntroNudgeMail(site)
  let failed = false

  const report = await runSuggestIntros({
    dryRun,
    mailReady: gmailCredentialsPresent(),
    plan,
    pendingMail,
    meetMail,
    writeSuggestions: async (rows) => {
      const { error } = await admin.from('intro_suggestions').insert(rows.map(suggestionInsert))
      if (error && !/duplicate key|23505/i.test(error.message || '')) failed = true
    },
    claimPending: async (introId) => {
      const { data, error } = await admin
        .from('member_intros')
        .update({ pending_nudge_sent_at: now.toISOString() })
        .eq('id', introId)
        .is('pending_nudge_sent_at', null)
        .select('id')
      if (error) return false
      return Array.isArray(data) && data.length > 0
    },
    releasePending: async (introId) => {
      await admin.from('member_intros').update({ pending_nudge_sent_at: null }).eq('id', introId)
    },
    claimMeet: async (introId, party) => {
      const column = party === 'requester' ? 'meet_nudge_requester_sent_at' : 'meet_nudge_target_sent_at'
      const { data, error } = await admin
        .from('member_intros')
        .update({ [column]: now.toISOString() })
        .eq('id', introId)
        .is(column, null)
        .select('id')
      if (error) return false
      return Array.isArray(data) && data.length > 0
    },
    releaseMeet: async (introId, party) => {
      const column = party === 'requester' ? 'meet_nudge_requester_sent_at' : 'meet_nudge_target_sent_at'
      await admin.from('member_intros').update({ [column]: null }).eq('id', introId)
    },
    send: async (nudge, mail) => {
      const sent = await sendEmail({ to: nudge.email, subject: mail.subject, html: mail.html, text: mail.text })
      if (sent.status === 'sent' || sent.status === 'error') {
        await logEmailEvent(admin, {
          application_id: null,
          kind: nudge.kind === 'pending' ? 'intro_pending_nudge' : 'intro_meet_nudge',
          recipient: nudge.email,
          subject: mail.subject,
          status: sent.status,
          provider: sent.provider,
          provider_id: sent.providerId,
          detail: sent.detail ?? null,
          payload: { intro_id: nudge.introId },
        })
      }
      if (sent.status === 'sent') return 'sent'
      if (sent.status === 'dry_run') return 'skipped'
      return 'error'
    },
  })

  if (failed) return jsonResponse(req, report, 500)
  return jsonResponse(req, report)
})

async function loadPlanInputs(
  admin: ReturnType<typeof createClient>,
  now: Date,
): Promise<{
  members: PlanMember[]
  intros: PlanIntro[]
  weekCount: number
} | null> {
  const week = isoWeekParts(now)
  const [membersRes, profilesRes, introsRes, samplesRes, weekRes] = await Promise.all([
    admin.from('members').select('user_id, email, status, seat, is_demo'),
    admin.from('profiles').select('user_id, full_name, sector_tags, vision_themes, location'),
    admin
      .from('member_intros')
      .select(
        'id, requester_id, target_id, status, requested_at, decided_at, pending_nudge_sent_at, meet_nudge_requester_sent_at, meet_nudge_target_sent_at',
      ),
    admin.from('directory_entries').select('id'),
    admin
      .from('intro_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('iso_year', week.year)
      .eq('iso_week', week.week),
  ])
  if (membersRes.error || profilesRes.error || introsRes.error || samplesRes.error || weekRes.error) return null

  const samples = new Set(
    ((samplesRes.data ?? []) as { id?: string }[]).map((row) => row.id).filter((id): id is string => Boolean(id)),
  )
  const profiles = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((row) => [String(row.user_id || ''), row]),
  )
  const members = ((membersRes.data ?? []) as MemberRow[])
    .map((row) => toMember(row, profiles.get(String(row.user_id || '')), samples))
    .filter((row): row is PlanMember => row !== null)
  const intros = ((introsRes.data ?? []) as IntroRow[])
    .map(toIntro)
    .filter((row): row is PlanIntro => row !== null)

  return { members, intros, weekCount: weekRes.count ?? 0 }
}

function toMember(row: MemberRow, profile: ProfileRow | undefined, samples: ReadonlySet<string>): PlanMember | null {
  const id = String(row.user_id || '')
  if (!id) return null
  const fullName = String(profile?.full_name || '').trim()
  return {
    id,
    email: String(row.email || ''),
    status: String(row.status || ''),
    seat: String(row.seat || ''),
    isDemo: row.is_demo === true,
    fullName,
    sectorTags: stringList(profile?.sector_tags),
    visionThemes: stringList(profile?.vision_themes),
    region: String(profile?.location || '').trim(),
    sample: samples.has(id) || row.is_demo === true || isExampleMemberName(fullName),
  }
}

function toIntro(row: IntroRow): PlanIntro | null {
  const id = String(row.id || '')
  const requesterId = String(row.requester_id || '')
  const targetId = String(row.target_id || '')
  if (!id || !requesterId || !targetId) return null
  return {
    id,
    requesterId,
    targetId,
    status: String(row.status || ''),
    requestedAt: String(row.requested_at || ''),
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    pendingNudgeSent: Boolean(row.pending_nudge_sent_at),
    meetRequesterSent: Boolean(row.meet_nudge_requester_sent_at),
    meetTargetSent: Boolean(row.meet_nudge_target_sent_at),
  }
}

function suggestionInsert(row: PlannedSuggestion) {
  return {
    member_id: row.memberId,
    suggested_id: row.suggestedId,
    iso_year: row.isoYear,
    iso_week: row.isoWeek,
    rank: row.rank,
    reason: row.reason,
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}
