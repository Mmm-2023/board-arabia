import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()
  if (userError || !user) {
    return jsonResponse(req, { error: 'Unauthorized' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: staff } = await admin
    .from('staff_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!staff) return jsonResponse(req, { error: 'Not staff' }, 403)

  let userId = ''
  let action = ''
  try {
    const body = await req.json()
    userId = String(body.user_id || '')
    action = String(body.action || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!/^[0-9a-f-]{36}$/i.test(userId) || (action !== 'suspend' && action !== 'restore')) {
    return jsonResponse(req, { error: 'user_id and action (suspend|restore) required' }, 400)
  }

  const { data: member, error } = await admin
    .from('members')
    .select('user_id, status, must_set_password')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !member) {
    return jsonResponse(req, { error: error?.message || 'Member not found' }, 404)
  }

  let nextStatus = ''
  if (action === 'suspend') {
    if (member.status === 'suspended') {
      return jsonResponse(req, { error: 'Already suspended' }, 409)
    }
    nextStatus = 'suspended'
  } else {
    if (member.status !== 'suspended') {
      return jsonResponse(req, { error: 'This member is not suspended' }, 409)
    }
    nextStatus = member.must_set_password ? 'invited' : 'active'
  }

  const { error: updateError } = await admin
    .from('members')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (updateError) return jsonResponse(req, { error: updateError.message }, 500)

  return jsonResponse(req, {
    ok: true,
    status: nextStatus,
    message: nextStatus === 'suspended' ? 'Member suspended.' : 'Member restored.',
  })
})
