import { fetchDirectory, fetchHomeActivity, fetchMandates, fetchPartners, fetchRooms } from './demoFetch'
import { figuresAsOfLabel } from './riyadhStamp'
import {
  platformMoneyLines,
  type DirectoryBrief,
  type HomeActivity,
  type HomeGathering,
  type HomeModel,
  type MandateBrief,
  type PartnerBrief,
  type RoomBrief,
} from './homeSnapshot'
import type { MandateCardModel } from './mandateRedaction'
import { fetchMajlisEvents, fetchPlatformStats, fetchSponsorMajlis } from './supabase'

export type LoadedSources = {
  mandates: MandateBrief[] | null
  rooms: RoomBrief[] | null
  directory: DirectoryBrief[] | null
  partners: PartnerBrief[] | null
  gatherings: HomeGathering[] | null
  admitted: number | null
  ksa: number | null
  intl: number | null
  money: { label: string; value: string }[] | null
  activity: HomeActivity[] | null
  activityStatus: HomeModel['activityStatus']
  partialError: boolean
  figuresAsOf: string | null
}

export async function loadHomeSources(input: { userId: string; sponsor: boolean }): Promise<LoadedSources> {
  const [directory, mandates, rooms, partners, majlis, stats, activity] = await Promise.all([
    fetchDirectory(),
    fetchMandates(),
    fetchRooms(),
    fetchPartners(),
    input.sponsor ? fetchSponsorMajlis() : fetchMajlisEvents(),
    fetchPlatformStats(),
    fetchHomeActivity(),
  ])

  let partialError = false

  const directoryRows = takeList(directory, (rows) =>
    rows.map((row) => ({
      id: row.id,
      is_demo: row.is_demo,
      full_name: row.full_name,
      headline: row.headline,
      seat: row.seat,
      membership_status: row.membership_status ?? null,
    })),
  )
  const mandateRows = takeList(mandates, (rows) => rows.map(clearMandate))
  const roomRows = takeList(rooms, (rows) =>
    rows.map((row) => ({
      id: row.id,
      is_demo: row.is_demo,
      name: row.name,
      sector: row.sector,
      stage: row.stage,
    })),
  )
  const partnerRows = takeList(partners, (rows) =>
    rows.map((row) => ({
      id: row.id,
      is_demo: row.is_demo,
      name: row.name,
      monogram: row.monogram,
      blurb: row.blurb,
      logo_path: row.logo_path,
      is_partner: row.is_partner,
    })),
  )
  if (!directoryRows || !mandateRows || !roomRows || !partnerRows) partialError = true

  let gatherings: HomeGathering[] | null = []
  if ('error' in majlis) {
    gatherings = null
    partialError = true
  } else {
    gatherings = majlis.events.map((event) => ({
      id: event.id,
      title: event.title,
      region: event.region,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      status: event.status,
      host: 'host_member_id' in event && event.host_member_id === input.userId,
      rsvp: homeRsvp('my_rsvp_status' in event ? event.my_rsvp_status : null),
    }))
  }

  let activityRows: HomeActivity[] | null = null
  let activityStatus: HomeModel['activityStatus'] = 'empty'
  if (activity.status === 'error') {
    activityStatus = 'error'
    partialError = true
  } else if (activity.status === 'missing') {
    activityStatus = 'unavailable'
  } else {
    activityRows = activity.rows
    activityStatus = activity.rows.length > 0 ? 'ready' : 'empty'
  }

  return {
    mandates: mandateRows,
    rooms: roomRows,
    directory: directoryRows,
    partners: partnerRows,
    gatherings,
    admitted: stats ? stats.admitted : null,
    ksa: stats ? stats.ksa : null,
    intl: stats ? stats.intl : null,
    money: platformMoneyLines(stats),
    activity: activityRows,
    activityStatus,
    partialError: partialError || stats == null,
    figuresAsOf: figuresAsOfLabel(stats?.updatedAt),
  }
}

function homeRsvp(status: string | null): HomeGathering['rsvp'] {
  if (status === 'registered' || status === 'waitlist' || status === 'cancelled') return status
  return null
}

function takeList<T, R>(
  result: { status: 'ready'; rows: T } | { status: 'missing' } | { status: 'error' },
  map: (rows: T) => R,
): R | null {
  if (result.status === 'error') return null
  if (result.status === 'missing') return map([] as T)
  return map(result.rows)
}

function clearMandate(row: MandateCardModel): MandateBrief {
  return {
    id: row.id,
    is_demo: row.is_demo,
    sector: row.sector,
    deal_type: row.deal_type,
    ticket_band: row.ticket_band,
    geography: row.geography,
    stage: row.stage,
    one_liner: row.one_liner,
    intro_status: row.intro_status === 'approved' ? 'approved' : row.intro_status,
  }
}
