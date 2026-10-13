import { useEffect, useState } from 'react'
import { FoundingWelcome } from './FoundingWelcome'
import { membershipLine } from '../../../supabase/functions/_shared/membership_steps.ts'
import { Link } from 'react-router-dom'
import { dismissAdmitShareCard, loadAdmitShareCard, type AdmitShareCardState } from '../../lib/admitShareCard'
import { SponsorBadge } from '../../components/SponsorBadge'
import { AVATAR_BUCKET } from '../../lib/avatar'
import { isProfileReady } from '../../lib/directoryGate'
import { fetchMyIntroSuggestions } from '../../lib/demoFetch'
import { fetchMyDealRooms } from '../../lib/dealRoomApi'
import { pendingInvites, type MemberDealRoom } from '../../lib/dealRoomView'
import { assembleHome, isFoundingMember, type AttentionItem, type ProfileMatchInput } from '../../lib/homeSnapshot'
import { loadHomeSources, type LoadedSources } from '../../lib/homeSnapshotLoad'
import { buildNeedsYou, digestPreviewLines, profileGapCount } from '../../lib/homeNeeds'
import { readAssurance } from '../../lib/mfa'
import { useOwnSuggestionProfile } from '../../lib/suggestionProfileLoad'
import { presentWeeklyDigest } from '../../lib/weeklyDigest'
import { seatLabel } from '../../lib/member'
import { loadProfileMatch, profileMatchFromRow } from '../../lib/profileMatchLoad'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { ErrorBanner, HomeSkeleton } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { readMemberDailyBrief, type MemberBrief } from '../../lib/dailyMarketBrief'
import { loadUnreadNotification, markNotificationRead } from '../../lib/memberNotifications'
import type { UnreadNotification } from '../../lib/boardSeats'
import { useDashboardStatus, useMember } from './context'
import { DailyMarketBriefCard } from './DailyMarketBriefCard'
import { AdmitShareCard } from './AdmitShareCard'
import { HomeSnapshotView, type DigestHomeNotice } from './HomeSnapshotView'
import { SponsorWelcomeGate } from './SponsorWelcomeGate'

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
  figuresAsOf: null,
}

export function DashboardHome() {
  const { member, profile, staffRole, userId } = useMember()
  const suggestionProfile = useOwnSuggestionProfile(userId)
  const status = useDashboardStatus()
  const [attempt, setAttempt] = useState(0)
  const [profileMatch, setProfileMatch] = useState<ProfileMatchInput>({
    status: 'loading',
    availabilitySet: false,
    sectorSet: false,
  })
  const [bundle, setBundle] = useState<{ attempt: number; nowMs: number; sources: LoadedSources } | null>(null)
  const [photo, setPhoto] = useState<{ path: string; url: string } | null>(null)
  const [invites, setInvites] = useState<MemberDealRoom[]>([])
  const [inviteError, setInviteError] = useState('')
  const [inviteAttempt, setInviteAttempt] = useState(0)
  const [shareCard, setShareCard] = useState<AdmitShareCardState>({ show: false })
  const [shareDismissing, setShareDismissing] = useState(false)
  const [shareDismissError, setShareDismissError] = useState('')
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [suggestionCount, setSuggestionCount] = useState(0)
  const [twoStepOff, setTwoStepOff] = useState(false)
  const [weekLines, setWeekLines] = useState<string[]>([])
  const [dailyBrief, setDailyBrief] = useState<MemberBrief | null>(null)
  const [digestNotice, setDigestNotice] = useState<DigestHomeNotice | null>(null)
  const [unreadNote, setUnreadNote] = useState<UnreadNotification | null>(null)
  useNoIndex('Home | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('my_digest_notices').then(({ data }) => {
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : null
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        setDigestNotice(null)
        return
      }
      const notice = row as { title?: unknown; href?: unknown }
      if (typeof notice.title !== 'string' || typeof notice.href !== 'string') {
        setDigestNotice(null)
        return
      }
      setDigestNotice({ title: notice.title, href: notice.href })
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadUnreadNotification().then((row) => {
      if (!cancelled) setUnreadNote(row)
    })
    return () => {
      cancelled = true
    }
  }, [attempt, userId])

  useEffect(() => {
    if (!membershipLine(member.tier, member.founding_number)) return
    try {
      if (localStorage.getItem(`ba-upgrade-${userId}`) === '1') return
    } catch {
      // The welcome can show again.
    }
    setUpgradeOpen(true)
  }, [member.founding_number, member.tier, userId])

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
    const known = profileMatchFromRow(profile)
    if (known) {
      setProfileMatch(known)
      return
    }
    setProfileMatch({ status: 'loading', availabilitySet: false, sectorSet: false })
    void loadProfileMatch(userId).then((next) => {
      if (!cancelled) setProfileMatch(next)
    })
    return () => {
      cancelled = true
    }
  }, [profile, userId])

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
    void loadAdmitShareCard().then((next) => {
      if (!cancelled) setShareCard(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  function dismissShareCard() {
    setShareDismissing(true)
    setShareDismissError('')
    void dismissAdmitShareCard().then((ok) => {
      setShareDismissing(false)
      if (!ok) {
        setShareDismissError('Could not dismiss this card. Try again.')
        return
      }
      setShareCard({ show: false })
    })
  }

  useEffect(() => {
    let cancelled = false
    void readMemberDailyBrief().then((next) => {
      if (!cancelled) setDailyBrief(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void fetchMyIntroSuggestions().then((result) => {
      if (cancelled) return
      setSuggestionCount(result.status === 'ready' ? result.rows.length : 0)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void readAssurance().then((assurance) => {
      if (!cancelled) setTwoStepOff(Boolean(assurance.userId) && !assurance.verifiedFactor)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('my_weekly_digest').then(({ data, error }) => {
      if (cancelled) return
      const next = error ? null : presentWeeklyDigest(data)
      setWeekLines(next ? digestPreviewLines(next) : [])
    })
    return () => {
      cancelled = true
    }
  }, [userId])

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
    avatarStyle: profile?.avatar_style,
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
    updatedLabel: null,
    profileMatch,
  })

  return (
    <div>
      {upgradeOpen ? (
        <FoundingWelcome
          tier={member.tier}
          foundingNumber={member.founding_number}
          onDismiss={() => {
            try {
              localStorage.setItem(`ba-upgrade-${userId}`, '1')
            } catch {
              // The welcome can show again.
            }
            setUpgradeOpen(false)
          }}
        />
      ) : null}
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
      {member.seat === 'sponsor' ? <SponsorWelcomeGate /> : null}
      {member.seat === 'sponsor' ? (
        <section className="mb-8 max-w-3xl border border-[var(--ba-line)] bg-white px-5 py-4">
          <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em]">Your partnership</h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/70">
            Package, seat category, majlis slots, approved intros, and credits.
          </p>
          <Link
            to="/dashboard/partnership"
            className="mt-3 inline-flex min-h-11 items-center font-semibold text-[var(--ba-indigo)] underline"
          >
            Open partnership
          </Link>
        </section>
      ) : null}
      {inviteError ? (
        <div className="mb-6 max-w-3xl">
          <ErrorBanner
            tone="member"
            message={inviteError}
            retryLabel={MEMBER_VIEWS.rooms.retry}
            onRetry={() => setInviteAttempt((value) => value + 1)}
          />
        </div>
      ) : null}
      <HomeSnapshotView
        model={model}
        sponsorBadge={member.seat === 'sponsor' ? <SponsorBadge /> : null}
        seatCaption={member.seat === 'sponsor' ? 'Seat' : 'Founding seat'}
        seatValue={seatLabel(member.seat)}
        figuresAsOf={sources.figuresAsOf}
        userId={userId}
        digestNotice={digestNotice}
        staff={staffRole != null}
        weekLines={weekLines}
        needsYou={buildNeedsYou({
          twoStepOff,
          profileGaps: staffRole != null ? 0 : profileGapCount(suggestionProfile),
          invites: invites.map((room) => ({ id: room.id, name: room.name })),
          suggestionCount,
          attention,
        })}
        dailyBriefSlot={dailyBrief ? <DailyMarketBriefCard brief={dailyBrief} /> : null}
        unreadNote={unreadNote}
        onMarkNotificationRead={(id) => {
          void markNotificationRead(id).then((ok) => {
            if (ok) setUnreadNote(null)
          })
        }}
        shareSlot={
          shareCard.show ? (
            <AdmitShareCard
              href={shareCard.href}
              dismissing={shareDismissing}
              error={shareDismissError}
              onShare={() => setShareCard({ show: false })}
              onDismiss={dismissShareCard}
            />
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
