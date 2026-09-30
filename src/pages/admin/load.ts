import type { FoundingCapacity } from '../../lib/member'
import type { PlatformStats } from '../../lib/platformStats'

export const ADMIN_LOAD_PANELS = [
  'capacity',
  'applications',
  'members',
  'invites',
  'email',
  'staff',
  'profiles',
] as const

export type AdminLoadPanel = (typeof ADMIN_LOAD_PANELS)[number]

export type Listed<T> = {
  data: T[] | null
  error: { message: string } | null
}

export type Keep = { keep: true }

export function isKeep<T>(value: T | Keep): value is Keep {
  return typeof value === 'object' && value !== null && 'keep' in value && value.keep === true
}

const keep: Keep = { keep: true }

export type AdminLoadInput<TApp, TMember, TInvite, TEvent, TStaff, TProfile extends { user_id: string }> = {
  capacity: { error: string } | FoundingCapacity
  platform: PlatformStats | null
  apps: Listed<TApp>
  members: Listed<TMember>
  invites: Listed<TInvite>
  events: Listed<TEvent>
  directory: Listed<TStaff>
  profiles: Listed<TProfile>
}

export type AdminLoadSettled<TApp, TMember, TInvite, TEvent, TStaff, TProfile extends { user_id: string }> = {
  capacity: FoundingCapacity | Keep
  platform: PlatformStats | Keep
  apps: TApp[] | Keep
  members: TMember[] | Keep
  peerInvites: TInvite[] | Keep
  events: TEvent[] | Keep
  staffRows: TStaff[] | Keep
  profileByUser: Record<string, TProfile> | Keep
  failed: Partial<Record<AdminLoadPanel, true>>
}

function listed<T>(
  result: Listed<T>,
  panel: AdminLoadPanel,
  failed: Partial<Record<AdminLoadPanel, true>>,
): T[] | Keep {
  if (result.error) {
    failed[panel] = true
    return keep
  }
  return result.data ?? []
}

export function settleAdminLoad<
  TApp,
  TMember,
  TInvite,
  TEvent,
  TStaff,
  TProfile extends { user_id: string },
>(
  input: AdminLoadInput<TApp, TMember, TInvite, TEvent, TStaff, TProfile>,
): AdminLoadSettled<TApp, TMember, TInvite, TEvent, TStaff, TProfile> {
  const failed: Partial<Record<AdminLoadPanel, true>> = {}
  let capacity: FoundingCapacity | Keep = keep
  if ('error' in input.capacity) failed.capacity = true
  else capacity = input.capacity

  const profiles = listed(input.profiles, 'profiles', failed)
  return {
    capacity,
    platform: input.platform ?? keep,
    apps: listed(input.apps, 'applications', failed),
    members: listed(input.members, 'members', failed),
    peerInvites: listed(input.invites, 'invites', failed),
    events: listed(input.events, 'email', failed),
    staffRows: listed(input.directory, 'staff', failed),
    profileByUser: isKeep(profiles) ? keep : profilesByUser(profiles),
    failed,
  }
}

function profilesByUser<T extends { user_id: string }>(rows: T[]): Record<string, T> {
  const next: Record<string, T> = {}
  for (const row of rows) next[row.user_id] = row
  return next
}
