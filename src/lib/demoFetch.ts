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
import { introRequestError, presentIntroList, type IntroRow } from './memberIntros'
import {
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

export async function requestMemberIntro(targetId: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc('request_member_intro', {
    p_target_id: targetId,
    p_reason: reason,
  })
  if (error) return introRequestError(error.message)
  return null
}

export async function respondMemberIntro(
  introId: string,
  decision: 'accepted' | 'declined',
): Promise<string | null> {
  const { error } = await supabase.rpc('respond_member_intro', {
    p_intro_id: introId,
    p_decision: decision,
  })
  if (error) {
    if (/sample_blocked/i.test(error.message)) return 'Sample cards cannot take a request.'
    return 'Could not save that answer. Retry.'
  }
  return null
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
