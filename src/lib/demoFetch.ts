import {
  presentDirectoryList,
  presentPartnerList,
  presentRoomList,
  schemaMissing,
  type DirectoryCard,
  type PartnerCard,
  type RoomCard,
} from './demoRows'
import { presentHomeActivityList, type HomeActivity } from './homeSnapshot'
import { presentMandateList, type MandateCardModel } from './mandateRedaction'
import {
  presentReOpportunityList,
  presentRePartnerList,
  type ReOpportunityCard,
  type RePartnerCard,
} from './reRedaction'
import { presentIntroSuggestions, type IntroSuggestion } from './introSuggestions'
import {
  contactsByIntro,
  introRequestError,
  presentIntroContacts,
  presentIntroList,
  presentIntroQuota,
  type IntroContact,
  type IntroQuota,
  type IntroRow,
  type MeetOutcome,
} from './memberIntros'
import {
  notifyDeskIntro,
  requestMandateIntro as postMandateIntro,
  requestReOpportunityIntro as postReIntro,
  requestRePartnerIntro as postRePartnerIntro,
  supabase,
} from './supabase'

export type DemoLoad<T> =
  | { status: 'ready'; rows: T }
  | { status: 'missing' }
  | { status: 'error' }

async function loadJson<T>(
  call: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  present: (data: unknown) => T,
): Promise<DemoLoad<T>> {
  const { data, error } = await call
  if (error) {
    if (schemaMissing(error.message)) return { status: 'missing' }
    return { status: 'error' }
  }
  return { status: 'ready', rows: present(data) }
}

export function fetchDirectory(): Promise<DemoLoad<DirectoryCard[]>> {
  return loadJson(supabase.rpc('list_directory'), presentDirectoryList)
}

export function fetchMandates(): Promise<DemoLoad<MandateCardModel[]>> {
  return loadJson(supabase.rpc('list_member_mandates'), presentMandateList)
}

export function fetchRooms(): Promise<DemoLoad<RoomCard[]>> {
  return loadJson(supabase.rpc('list_member_rooms'), presentRoomList)
}

export function fetchPartners(): Promise<DemoLoad<PartnerCard[]>> {
  return loadJson(supabase.rpc('list_trusted_partners'), presentPartnerList)
}

export function fetchMyIntros(): Promise<DemoLoad<IntroRow[]>> {
  return loadJson(supabase.rpc('list_my_intros'), presentIntroList)
}

export function fetchMyIntroSuggestions(): Promise<DemoLoad<IntroSuggestion[]>> {
  return loadJson(supabase.rpc('list_my_intro_suggestions'), presentIntroSuggestions)
}

export async function recordIntroMeet(introId: string, outcome: MeetOutcome): Promise<string | null> {
  const { error } = await supabase.rpc('record_intro_meet', { p_intro_id: introId, p_outcome: outcome })
  if (error) return 'Could not save that answer. Retry.'
  return null
}

export async function requestMemberIntro(
  targetId: string,
  reason: string,
  askDesk = false,
): Promise<string | null> {
  const args = askDesk
    ? { p_target_id: targetId, p_reason: reason, p_ask_desk: true }
    : { p_target_id: targetId, p_reason: reason }
  const { error } = await supabase.rpc('request_member_intro', args)
  if (error) return introRequestError(error.message)
  return null
}

export async function respondMemberIntro(
  introId: string,
  decision: 'accepted' | 'declined',
): Promise<string | null> {
  const { data, error } = await supabase.rpc('respond_member_intro', {
    p_intro_id: introId,
    p_decision: decision,
  })
  if (error) {
    if (/sample_blocked/i.test(error.message)) return 'Sample cards cannot take a request.'
    return 'Could not save that answer. Retry.'
  }
  const queued =
    data != null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    (data as { desk_queued?: unknown }).desk_queued === true
  if (queued) void notifyDeskIntro(introId)
  return null
}

export function fetchIntroContacts(): Promise<DemoLoad<Record<string, IntroContact>>> {
  return loadJson(supabase.rpc('list_accepted_intro_contacts'), (data) => contactsByIntro(presentIntroContacts(data)))
}

export async function fetchIntroQuota(): Promise<IntroQuota | null> {
  const { data, error } = await supabase.rpc('my_intro_quota')
  if (error) return null
  return presentIntroQuota(data)
}

export function fetchHomeActivity(): Promise<DemoLoad<HomeActivity[]>> {
  return loadJson(supabase.rpc('list_member_home_activity'), presentHomeActivityList)
}

export async function requestMandateIntro(mandateId: string): Promise<'ok' | 'error'> {
  return postMandateIntro(mandateId)
}

export function fetchReOpportunities(): Promise<DemoLoad<ReOpportunityCard[]> | { status: 'denied' }> {
  return loadReOpportunities()
}

async function loadReOpportunities(): Promise<DemoLoad<ReOpportunityCard[]> | { status: 'denied' }> {
  const { data, error } = await supabase.rpc('list_re_opportunities')
  if (error) {
    if (schemaMissing(error.message)) return { status: 'missing' }
    const code = 'code' in error ? String(error.code) : ''
    if (code === '42501' || /not_allowed/i.test(error.message)) return { status: 'denied' }
    return { status: 'error' }
  }
  return { status: 'ready', rows: presentReOpportunityList(data) }
}

export function fetchRePartners(): Promise<DemoLoad<RePartnerCard[]> | { status: 'denied' }> {
  return loadRePartners()
}

async function loadRePartners(): Promise<DemoLoad<RePartnerCard[]> | { status: 'denied' }> {
  const { data, error } = await supabase.rpc('list_re_partners')
  if (error) {
    if (schemaMissing(error.message)) return { status: 'missing' }
    const code = 'code' in error ? String(error.code) : ''
    if (code === '42501' || /not_allowed/i.test(error.message)) return { status: 'denied' }
    return { status: 'error' }
  }
  return { status: 'ready', rows: presentRePartnerList(data) }
}

export async function requestReOpportunityIntro(opportunityId: string): Promise<'ok' | 'error'> {
  return postReIntro(opportunityId)
}

export async function requestRePartnerIntro(partnerId: string): Promise<'ok' | 'error'> {
  return postRePartnerIntro(partnerId)
}
