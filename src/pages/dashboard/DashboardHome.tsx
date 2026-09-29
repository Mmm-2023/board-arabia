import { useEffect, useState } from 'react'
import { SponsorBadge } from '../../components/SponsorBadge'
import { AVATAR_BUCKET } from '../../lib/avatar'
import { isProfileReady } from '../../lib/directoryGate'
import { fetchMyDealRooms, respondDealRoom } from '../../lib/dealRoomApi'
import { pendingInvites, type MemberDealRoom } from '../../lib/dealRoomView'
import { assembleHome, isFoundingMember, type AttentionItem } from '../../lib/homeSnapshot'
import { loadHomeSources, type LoadedSources } from '../../lib/homeSnapshotLoad'
import { seatLabel } from '../../lib/member'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { ErrorBanner, HomeSkeleton } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { formatUpdated } from '../../shell/destinations'
import { useDashboardStatus, useMember } from './context'
import { HomeSnapshotView } from './HomeSnapshotView'
import { PendingInviteCards } from './PendingInviteCards'

const EMPTY_SOURCES: LoadedSources = {
  mandates: null,
  rooms: null,
  directory: null,
  partners: null,
  gatherings: null,
  admitted: null,
  ksa: null,
  intl: null,
  money: null,
  activity: null,
  activityStatus: 'loading',
  partialError: false,
}

export function DashboardHome() {
  const { member, profile, userId } = useMember()
  const status = useDashboardStatus()
  const [attempt, setAttempt] = useState(0)
  const [bundle, setBundle] = useState<{ attempt: number; nowMs: number; sources: LoadedSources } | null>(null)
  const [photo, setPhoto] = useState<{ path: string; url: string } | null>(null)
  const [invites, setInvites] = useState<MemberDealRoom[]>([])
  const [inviteError, setInviteError] = useState('')
  const [inviteBusy, setInviteBusy] = useState<string | null>(null)
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({})
  const [inviteAttempt, setInviteAttempt] = useState(0)
  useNoIndex('Home | Board Arabia')

  useEffect(() => {
    const path = profile?.avatar_path
    if (!path) return
    let cancelled = false
    void supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, 600)
      .then(({ data, error }) => {
        if (cancelled || error || !data?.signedUrl) return
        setPhoto({ path, url: data.signedUrl })
      })
    return () => {
      cancelled = true
    }
  }, [profile?.avatar_path, attempt])

  useEffect(() => {
    let cancelled = false
    const current = attempt
    void loadHomeSources({ userId, sponsor: String(member.seat) === 'sponsor' }).then((next) => {
      if (cancelled) return
      setBundle({ attempt: current, nowMs: Date.now(), sources: next })
    })
    return () => {
      cancelled = true
    }
  }, [attempt, member.seat, userId])

  useEffect(() => {
    let cancelled = false
    void fetchMyDealRooms().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') {
        setInvites(pendingInvites(result.rows))
        setInviteError('')
        return
      }
      setInvites([])
      if (result.status === 'error') setInviteError(MEMBER_VIEWS.rooms.error)
      else setInviteError('')
    })
    return () => {
      cancelled = true
    }
  }, [inviteAttempt])

  function respond(roomId: string, decision: 'accept' | 'decline') {
    setInviteBusy(roomId)
    setInviteErrors((current) => {
      const next = { ...current }
      delete next[roomId]
      return next
    })
    void respondDealRoom(roomId, decision).then((result) => {
      setInviteBusy(null)
      if (result.status !== 'ok') {
        setInviteErrors((current) => ({ ...current, [roomId]: result.message }))
        return
      }
      setInviteAttempt((value) => value + 1)
    })
  }

  if (status.refreshing && !status.updatedAt) {
    return <HomeSkeleton tone="member" cards={3} />
  }

  const sources = bundle?.attempt === attempt ? bundle.sources : EMPTY_SOURCES
  const loading = bundle?.attempt !== attempt
  const photoUrl = profile?.avatar_path && photo?.path === profile.avatar_path ? photo.url : null
  const profileReady = isProfileReady(profile)
  const founding = isFoundingMember(String(member.seat))
  const attention: AttentionItem[] = []
  if (member.must_set_password) {
    attention.push({
      title: 'Set your password',
      body: 'Set a password before you leave this session so your invite link is not the only way back in.',
      to: '/dashboard/profile#password',
      cta: 'Set password',
    })
  } else if (!profileReady) {
    attention.push({
      title: 'Finish your profile',
      body: MEMBER_VIEWS.home.empty,
      to: '/dashboard/profile',
      cta: MEMBER_VIEWS.home.emptyCta,
    })
  }

  const model = assembleHome({
    nowMs: bundle?.attempt === attempt ? bundle.nowMs : 0,
    seat: String(member.seat),
    name: profile?.full_name?.trim() || "You're in",
    photoUrl,
    profileReady,
    mustSetPassword: member.must_set_password,
    invitesRemaining: member.invites_remaining,
    personalCapacityIncluded: founding
      ? Boolean(profile?.include_in_public_aggregates && profile?.capacity_verified)
      : null,
    attention,
    mandates: sources.mandates,
    rooms: sources.rooms,
    directory: sources.directory,
    partners: sources.partners,
    gatherings: sources.gatherings,
    admitted: sources.admitted,
    ksa: sources.ksa,
    intl: sources.intl,
    money: sources.money,
    activity: sources.activity,
    activityStatus: loading ? 'loading' : sources.activityStatus,
    loading,
    partialError: !loading && sources.partialError,
    updatedLabel: formatUpdated(status.updatedAt),
  })

  return (
    <div>
      {status.refreshError ? (
        <div className="mb-6 max-w-3xl">
          <ErrorBanner
            tone="member"
            message={status.refreshError}
            onRetry={status.retry}
            retryLabel={MEMBER_VIEWS.home.retry}
          />
        </div>
      ) : null}
      <HomeSnapshotView
        model={model}
        sponsorBadge={member.seat === 'sponsor' ? <SponsorBadge /> : null}
        seatCaption={member.seat === 'sponsor' ? 'Seat' : 'Founding seat'}
        seatValue={seatLabel(member.seat)}
        attentionLead={
          invites.length > 0 || inviteError ? (
            <div className="space-y-3">
              {inviteError ? (
                <ErrorBanner
                  tone="member"
                  message={inviteError}
                  retryLabel={MEMBER_VIEWS.rooms.retry}
                  onRetry={() => setInviteAttempt((value) => value + 1)}
                />
              ) : null}
              <PendingInviteCards
                invites={invites}
                busyId={inviteBusy}
                errors={inviteErrors}
                onAccept={(roomId) => respond(roomId, 'accept')}
                onDecline={(roomId) => respond(roomId, 'decline')}
              />
            </div>
          ) : null
        }
        onRetry={() => {
          setAttempt((value) => value + 1)
          setInviteAttempt((value) => value + 1)
        }}
      />
    </div>
  )
}
