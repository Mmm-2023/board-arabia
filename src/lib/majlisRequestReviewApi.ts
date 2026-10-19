import {
  MAJLIS_REQUEST_STATUSES,
  presentMajlisDrafts,
  presentMajlisRequests,
  type MajlisMailDraft,
  type MajlisRequestCard,
  type MajlisRequestStatus,
} from './majlisRequestReview'
import { supabase } from './supabase'

function deniedMessage(message: string, code?: string) {
  return code === '42501' || /not_allowed|permission denied/i.test(message)
}

export async function fetchMajlisRequestReview(): Promise<
  | { requests: MajlisRequestCard[]; drafts: MajlisMailDraft[] }
  | { error: string; denied?: boolean }
> {
  const [listed, drafted] = await Promise.all([
    supabase.rpc('staff_list_majlis_requests'),
    supabase.rpc('staff_majlis_request_drafts'),
  ])
  const failed = listed.error || drafted.error
  if (failed) {
    const message = failed.message || 'Could not load majlis requests.'
    return { error: message, denied: deniedMessage(message, failed.code) }
  }
  return {
    requests: presentMajlisRequests(listed.data),
    drafts: presentMajlisDrafts(drafted.data),
  }
}

export async function reviewMajlisRequest(
  id: string,
  decision: 'accepted' | 'rejected',
): Promise<{ status: MajlisRequestStatus } | { error: string; unverified?: boolean; denied?: boolean }> {
  const result = await supabase.rpc('review_majlis_application', { p_id: id, p_decision: decision })
  if (result.error) {
    const message = result.error.message || 'Could not save the decision.'
    return {
      error: message,
      unverified: /email_unverified/i.test(message),
      denied: deniedMessage(message, result.error.code),
    }
  }
  const payload = result.data as { status?: string } | null
  const status = payload && typeof payload.status === 'string' ? payload.status : ''
  if (!MAJLIS_REQUEST_STATUSES.includes(status as MajlisRequestStatus)) {
    return { error: 'Could not save the decision.' }
  }
  return { status: status as MajlisRequestStatus }
}

export async function saveMajlisRequestDraft(
  kind: 'accept' | 'decline',
  subject: string,
  body: string,
): Promise<{ ok: true } | { error: string; denied?: boolean }> {
  const result = await supabase.rpc('staff_save_majlis_request_draft', {
    p_kind: kind,
    p_subject: subject,
    p_body: body,
  })
  if (result.error) {
    const message = result.error.message || 'Could not save the draft.'
    return { error: message, denied: deniedMessage(message, result.error.code) }
  }
  return { ok: true }
}
