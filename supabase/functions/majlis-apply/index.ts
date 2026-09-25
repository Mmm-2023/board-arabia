import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { isLiveMember } from '../_shared/staff_auth.ts'
import { validateMajlisApplication } from '../_shared/majlis.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const header = req.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!supabaseUrl || !serviceKey || !anonKey || !token) {
    return jsonResponse(req, { error: 'Unauthorized' }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)
  if (userError || !user) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const tags = Array.isArray(body.focus_tags)
    ? body.focus_tags.map((tag) => String(tag))
    : []
  const capacity = Number(body.capacity)
  const parsed = validateMajlisApplication({
    title: String(body.title ?? ''),
    description: String(body.description ?? ''),
    region: String(body.region ?? ''),
    focusTags: tags,
    startsAtUtc: String(body.starts_at ?? ''),
    endsAtUtc: String(body.ends_at ?? ''),
    capacity: Number.isInteger(capacity) ? capacity : Number.NaN,
    venueName: String(body.venue_name ?? ''),
    venueAddress: String(body.venue_address ?? ''),
  })
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, 400)

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: member, error: memberError } = await admin
    .from('members')
    .select('user_id, seat, status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberError || !member || !isLiveMember(member.status) || member.seat === 'sponsor') {
    return jsonResponse(req, { error: 'Only members can apply to host.' }, 403)
  }

  const { error: limitError } = await admin.rpc('majlis_consume_apply_slot', {
    p_member: user.id,
  })
  if (limitError) {
    if (limitError.message.includes('rate_limited')) {
      return jsonResponse(req, { error: 'Too many applications. Try again later.' }, 429)
    }
    return jsonResponse(req, { error: 'Could not submit the application.' }, 500)
  }

  const { data: created, error: insertError } = await admin
    .from('majlis_events')
    .insert({
      host_member_id: user.id,
      title: parsed.value.title,
      description: parsed.value.description,
      region: parsed.value.region,
      focus_tags: parsed.value.focusTags,
      starts_at: parsed.value.startsAtUtc,
      ends_at: parsed.value.endsAtUtc,
      timezone: 'Asia/Riyadh',
      capacity: parsed.value.capacity,
      venue_name: parsed.value.venueName,
      venue_address: parsed.value.venueAddress,
      venue_visibility: 'members_on_rsvp',
      status: 'pending_approval',
    })
    .select('id, status')
    .single()
  if (insertError || !created) {
    return jsonResponse(req, { error: 'Could not submit the application.' }, 500)
  }

  return jsonResponse(req, { ok: true, id: created.id, status: created.status })
})
