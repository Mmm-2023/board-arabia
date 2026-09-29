import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  isLinkedInShareUrl,
  linkedInPostText,
  linkedInShareUrl,
  requestIsPrefetch,
  shareSeat,
} from '../_shared/admit_li_share.ts'

/** First-party click. Records the click, then forwards to the LinkedIn compose URL we built. */
Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('t') || ''
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
    return new Response('This share link is not valid.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  if (requestIsPrefetch((name) => req.headers.get(name))) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) {
    return new Response('Share link is not available.', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  const admin = createClient(supabaseUrl, serviceKey)
  const { data, error } = await admin.rpc('mark_admit_li_share_clicked', { p_token: token })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row || typeof row !== 'object') {
    return new Response('This share link is not valid.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  const record = row as {
    user_id?: string
    seat_label?: string | null
    post_text?: string | null
    headline?: string | null
    company?: string | null
  }
  let post = typeof record.post_text === 'string' ? record.post_text : ''
  if (!post) {
    const seat = shareSeat(record.seat_label || 'Founding Member')
    post = linkedInPostText({
      founding: seat.founding,
      seatLabel: seat.seatLabel,
      headline: record.headline,
      company: record.company,
    })
    if (record.user_id) {
      await admin.from('admit_li_share').update({ post_text: post }).eq('user_id', record.user_id).is('post_text', null)
    }
  }

  const destination = linkedInShareUrl(post)
  if (!isLinkedInShareUrl(destination)) {
    return new Response('Share link is not available.', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 302,
      headers: { Location: destination, 'Cache-Control': 'no-store' },
    })
  }
  return new Response(null, {
    status: 302,
    headers: { Location: destination, 'Cache-Control': 'no-store' },
  })
})
