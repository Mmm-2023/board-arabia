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
import {
  requestMandateIntro as postMandateIntro,
  requestReOpportunityIntro as postReIntro,
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

export function fetchHomeActivity(): Promise<DemoLoad<HomeActivity[]>> {
  return loadJson(supabase.rpc('list_member_home_activity'), presentHomeActivityList)
}

export async function requestMandateIntro(mandateId: string): Promise<'ok' | 'error'> {
  return postMandateIntro(mandateId)
}

export function fetchReOpportunities(): Promise<DemoLoad<ReOpportunityCard[]>> {
  return loadJson(supabase.rpc('list_re_opportunities'), presentReOpportunityList)
}

export function fetchRePartners(): Promise<DemoLoad<RePartnerCard[]>> {
  return loadJson(supabase.rpc('list_re_partners'), presentRePartnerList)
}

export async function requestReOpportunityIntro(opportunityId: string): Promise<'ok' | 'error'> {
  return postReIntro(opportunityId)
}
