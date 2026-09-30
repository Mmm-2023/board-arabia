import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  draftFromApplication,
  draftFromProfile,
  parseCapacityPayload,
  type CapacityDraft,
} from '../../lib/capacity'
import type { StoredAvatarStyle } from '../../lib/avatarStyle'
import type { FoundingCapacity, FoundingSeat } from '../../lib/member'
import type { PlatformStats } from '../../lib/platformStats'
import { endAuthSession } from '../../lib/endSession'
import { isStaffRole, showRoleSwitch, type StaffRole } from '../../../supabase/functions/_shared/staff_auth.ts'
import { isKeep, settleAdminLoad, type AdminLoadPanel } from './load'
import {
  admitMember,
  decideApplication,
  fetchAdminMembers,
  fetchFoundingCapacity,
  fetchPlatformStats,
  inviteMaster,
  setMemberStatus,
  staffSetMemberCapacity,
  supabase,
  type Application,
  type DryRunInvite,
  type EmailEventAdminRow,
  type MemberAdminRow,
  type MemberInviteAdminRow,
  type StaffDirectoryRow,
} from '../../lib/supabase'

type ProfileCapacity = {
  full_name: string | null
  company: string | null
  investable_capacity_usd: number | string | null
  fo_aum_usd: number | string | null
  turnover_usd: number | string | null
  include_in_public_aggregates: boolean
  capacity_verified: boolean
  avatar_style?: StoredAvatarStyle | null
  avatar_path?: string | null
}

export type AdminRoom = {
  session: Session | null
  booting: boolean
  isStaff: boolean
  staffRole: StaffRole | null
  loading: boolean
  hasLoaded: boolean
  listError: string
  refreshError: string
  queryDetail: string
  panelFailed: Partial<Record<AdminLoadPanel, true>>
  actionNote: string
  apps: Application[]
  members: MemberAdminRow[]
  peerInvites: MemberInviteAdminRow[]
  events: EmailEventAdminRow[]
  staffRows: StaffDirectoryRow[]
  profileByUser: Record<string, ProfileCapacity>
  capacity: FoundingCapacity | null
  platform: PlatformStats | null
  refreshedAt: Date | null
  updatingId: string | null
  dryRunInvite: DryRunInvite | null
  email: string
  isMember: boolean
  masterKnown: boolean | null
  seatById: Record<string, FoundingSeat | ''>
  setSeat: (id: string, seat: FoundingSeat | '') => void
  draftFor: (key: string, fallback: CapacityDraft) => CapacityDraft
  setDraft: (key: string, next: CapacityDraft) => void
  refresh: () => void
  onAccept: (id: string) => Promise<void>
  onAdmit: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  runInvite: (
    kind: string,
    input?: { email?: string; seat?: FoundingSeat; admitMember?: boolean },
  ) => Promise<void>
  onMemberStatus: (row: MemberAdminRow, action: 'suspend' | 'restore') => Promise<void>
  onSaveCapacity: (userId: string) => Promise<void>
  signOut: () => Promise<void>
}

const AdminContext = createContext<AdminRoom | null>(null)

export function AdminProvider({ children }: { children: ReactNode }) {
  const room = useAdminState()
  return <AdminContext.Provider value={room}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const value = useContext(AdminContext)
  if (!value) throw new Error('Staff room is not ready')
  return value
}

export function AdminPreview({ room, children }: { room: AdminRoom; children: ReactNode }) {
  return <AdminContext.Provider value={room}>{children}</AdminContext.Provider>
}

function useAdminState(): AdminRoom {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const signingOut = useRef(false)
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null)
  const [ownMemberStatus, setOwnMemberStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [apps, setApps] = useState<Application[]>([])
  const [members, setMembers] = useState<MemberAdminRow[]>([])
  const [peerInvites, setPeerInvites] = useState<MemberInviteAdminRow[]>([])
  const [events, setEvents] = useState<EmailEventAdminRow[]>([])
  const [staffRows, setStaffRows] = useState<StaffDirectoryRow[]>([])
  const [listError, setListError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [queryDetail, setQueryDetail] = useState('')
  const [panelFailed, setPanelFailed] = useState<Partial<Record<AdminLoadPanel, true>>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [seatById, setSeatById] = useState<Record<string, FoundingSeat | ''>>({})
  const [capacity, setCapacity] = useState<FoundingCapacity | null>(null)
  const [platform, setPlatform] = useState<PlatformStats | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [dryRunInvite, setDryRunInvite] = useState<DryRunInvite | null>(null)
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, CapacityDraft>>({})
  const [profileByUser, setProfileByUser] = useState<Record<string, ProfileCapacity>>({})

  const refreshStaffAndApps = useCallback(async (active: Session | null, opts?: { silent?: boolean }) => {
    if (!active) {
      setStaffRole(null)
      setOwnMemberStatus(null)
      setApps([])
      setMembers([])
      setPeerInvites([])
      setEvents([])
      setStaffRows([])
      setProfileByUser({})
      setPanelFailed({})
      setHasLoaded(false)
      setLoading(false)
      return
    }

    if (!opts?.silent) setLoading(true)
    const [staffRes, ownMemberRes] = await Promise.all([
      supabase.from('staff_users').select('role').eq('user_id', active.user.id).maybeSingle(),
      supabase.from('members').select('status').eq('user_id', active.user.id).maybeSingle(),
    ])

    const claimedRole = staffRes.data?.role
    if (staffRes.error || !isStaffRole(claimedRole)) {
      setStaffRole(null)
      setOwnMemberStatus(null)
      setApps([])
      setMembers([])
      setPeerInvites([])
      setEvents([])
      setStaffRows([])
      setProfileByUser({})
      setPanelFailed({})
      setListError('')
      setLoading(false)
      setHasLoaded(true)
      return
    }

    setStaffRole(claimedRole)
    setOwnMemberStatus(ownMemberRes.data?.status ?? null)

    const [capacityResult, platformResult, appsRes, membersRes, invitesRes, eventsRes, directoryRes, profilesRes] =
      await Promise.all([
        fetchFoundingCapacity(),
        fetchPlatformStats(),
        supabase.from('applications').select('*').order('created_at', { ascending: false }),
        fetchAdminMembers(),
        supabase
          .from('member_invites')
          .select('id, application_id, channel, status, inviter_member_id')
          .order('created_at', { ascending: false }),
        supabase
          .from('email_events')
          .select('id, created_at, kind, recipient, subject, status, detail')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase.rpc('list_staff_directory'),
        supabase
          .from('profiles')
          .select(
            'user_id, full_name, company, investable_capacity_usd, fo_aum_usd, turnover_usd, include_in_public_aggregates, capacity_verified, avatar_path, avatar_style',
          ),
      ])

    const settled = settleAdminLoad({
      capacity: capacityResult,
      platform: platformResult,
      apps: appsRes,
      members: membersRes,
      invites: invitesRes,
      events: eventsRes,
      directory: directoryRes,
      profiles: profilesRes,
    })
    if (!isKeep(settled.capacity)) setCapacity(settled.capacity)
    if (!isKeep(settled.platform)) setPlatform(settled.platform)
    if (!isKeep(settled.apps)) setApps(settled.apps as Application[])
    if (!isKeep(settled.members)) setMembers(settled.members as MemberAdminRow[])
    if (!isKeep(settled.peerInvites)) setPeerInvites(settled.peerInvites as MemberInviteAdminRow[])
    if (!isKeep(settled.events)) setEvents(settled.events as EmailEventAdminRow[])
    if (!isKeep(settled.staffRows)) setStaffRows(settled.staffRows as StaffDirectoryRow[])
    if (!isKeep(settled.profileByUser)) setProfileByUser(settled.profileByUser as Record<string, ProfileCapacity>)
    setPanelFailed(settled.failed)
    setQueryDetail('')
    setRefreshError('')
    setRefreshedAt(new Date())
    setHasLoaded(true)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (signingOut.current) return
      setSession(data.session)
      void refreshStaffAndApps(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (signingOut.current) {
        setSession(null)
        return
      }
      setSession(next)
      void refreshStaffAndApps(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [refreshStaffAndApps])

  useEffect(() => {
    if (!session || !isStaffRole(staffRole)) return
    const id = window.setInterval(() => {
      void refreshStaffAndApps(session, { silent: true })
    }, 30000)
    return () => window.clearInterval(id)
  }, [session, staffRole, refreshStaffAndApps])

  function appById(id: string) {
    return (
      apps.find((row) => row.id === id) ?? {
        investable_capacity_usd: null,
        include_in_public_aggregates: true,
        fo_aum: null,
        turnover: '',
      }
    )
  }

  function draftFor(key: string, fallback: CapacityDraft) {
    return capacityDrafts[key] ?? fallback
  }

  function setDraft(key: string, next: CapacityDraft) {
    setCapacityDrafts((prev) => ({ ...prev, [key]: next }))
  }

  async function onAccept(id: string) {
    setUpdatingId(id)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const result = await decideApplication(id, 'accepted')
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }
    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'accepted',
              decision_at: new Date().toISOString(),
              invite_event_id: 'private_booking_link',
              invite_sent_at: new Date().toISOString(),
              calendar_slot: 'private_invite_emailed',
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Accepted. Private booking link emailed.')
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  async function onAdmit(id: string) {
    const seat = seatById[id]
    if (seat !== 'ksa' && seat !== 'intl') {
      setListError('Choose a Saudi or international seat.')
      return
    }
    setUpdatingId(id)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const parsed = parseCapacityPayload(draftFor(id, draftFromApplication(appById(id))))
    if ('error' in parsed) {
      setListError(parsed.error)
      setUpdatingId(null)
      return
    }
    const result = await admitMember(id, seat, parsed)
    if (result.error) {
      setListError(result.error)
      setDryRunInvite(result.dryRunInvite ?? null)
      setUpdatingId(null)
      return
    }
    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'admitted',
              founding_seat: seat,
              admitted_at: new Date().toISOString(),
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Admitted.')
    setDryRunInvite(result.dryRunInvite ?? null)
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  async function onReject(id: string) {
    setUpdatingId(id)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const result = await decideApplication(id, 'rejected')
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }
    setApps((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: 'rejected',
              decision_at: new Date().toISOString(),
              invite_event_id: null,
              invite_sent_at: null,
              calendar_slot: null,
            }
          : row,
      ),
    )
    setActionNote(result.message || 'Rejected. Decline email sent.')
    setUpdatingId(null)
  }

  async function runInvite(
    kind: string,
    input?: { email?: string; seat?: FoundingSeat; admitMember?: boolean },
  ) {
    setUpdatingId(kind)
    setActionNote('')
    setDryRunInvite(null)
    setListError('')
    const result = await inviteMaster(input)
    if (result.error) {
      setListError(result.error)
      setDryRunInvite(result.dryRunInvite ?? null)
      setUpdatingId(null)
      return
    }
    setActionNote(result.message || 'Master staff is ready.')
    setDryRunInvite(result.dryRunInvite ?? null)
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  async function onMemberStatus(row: MemberAdminRow, action: 'suspend' | 'restore') {
    setUpdatingId(row.user_id)
    setActionNote('')
    setListError('')
    const result = await setMemberStatus(row.user_id, action)
    if (result.error || !result.status) {
      setListError(result.error || 'Update failed')
      setUpdatingId(null)
      return
    }
    setMembers((prev) =>
      prev.map((item) =>
        item.user_id === row.user_id
          ? { ...item, status: result.status as MemberAdminRow['status'] }
          : item,
      ),
    )
    setActionNote(result.message || 'Member updated.')
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  async function onSaveCapacity(userId: string) {
    const parsed = parseCapacityPayload(
      draftFor(userId, draftFromProfile(profileByUser[userId] ?? null)),
    )
    if ('error' in parsed) {
      setListError(parsed.error)
      return
    }
    setUpdatingId(userId)
    setActionNote('')
    setListError('')
    const result = await staffSetMemberCapacity(userId, parsed)
    if (result.error) {
      setListError(result.error)
      setUpdatingId(null)
      return
    }
    setActionNote('Capacity saved. Public totals recompute from admitted, verified, opted-in members.')
    setUpdatingId(null)
    if (session) void refreshStaffAndApps(session, { silent: true })
  }

  const email = session?.user.email?.toLowerCase() || ''
  const isMember = showRoleSwitch(staffRole, ownMemberStatus).toMember
  const self = staffRows.find((row) => row.email.toLowerCase() === email)
  const masterKnown = self ? self.role === 'master' : null

  return {
    session: session ?? null,
    booting: session === undefined,
    isStaff: staffRole !== null,
    staffRole,
    loading,
    hasLoaded,
    listError,
    refreshError,
    queryDetail,
    panelFailed,
    actionNote,
    apps,
    members,
    peerInvites,
    events,
    staffRows,
    profileByUser,
    capacity,
    platform,
    refreshedAt,
    updatingId,
    dryRunInvite,
    email: session?.user.email || '',
    isMember,
    masterKnown,
    seatById,
    setSeat: (id, seat) => setSeatById((prev) => ({ ...prev, [id]: seat })),
    draftFor,
    setDraft,
    refresh: () => {
      if (session) void refreshStaffAndApps(session, { silent: true })
    },
    onAccept,
    onAdmit,
    onReject,
    runInvite,
    onMemberStatus,
    onSaveCapacity,
    signOut: async () => {
      signingOut.current = true
      await endAuthSession(supabase)
      setSession(null)
    },
  }
}
