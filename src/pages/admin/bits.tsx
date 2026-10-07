import { MEMBERSHIP_TIER_LABELS, membershipTiersOf } from '../../lib/membershipTiers'
import { seatLabel } from '../../lib/member'
import { ADMIN_PANEL_NOTICE } from '../../shell/viewCopy'
import { holdsSponsorSeat } from '../../lib/sponsorSeat'
import type {
  Application,
  ApplicationStatus,
  DryRunInvite,
  MemberAdminRow,
  MemberInviteAdminRow,
  StaffDirectoryRow,
} from '../../lib/supabase'

const PEOPLE_TIERS = ['Master', 'Admin', 'Partner', 'Founding Member', 'Member'] as const
export type PersonTier = (typeof PEOPLE_TIERS)[number]
export { PEOPLE_TIERS }

export type TierPill = { id: string; label: string }

/** Every membership tier this person holds, in catalog order. */
export function membershipTierPills(member: MemberAdminRow): TierPill[] {
  return membershipTiersOf(member).map((id) => ({
    id,
    label: MEMBERSHIP_TIER_LABELS[id],
  }))
}

export function peopleInTier(
  tier: PersonTier,
  staffRows: StaffDirectoryRow[],
  members: MemberAdminRow[],
): { email: string; detail: string; pills: TierPill[] }[] {
  if (tier === 'Master') {
    return staffRows
      .filter((row) => row.role === 'master')
      .map((row) => ({
        email: row.email,
        detail: new Date(row.created_at).toLocaleString(),
        pills: [{ id: 'master', label: 'Master' }],
      }))
  }
  if (tier === 'Admin') {
    return staffRows
      .filter((row) => row.role === 'staff')
      .map((row) => ({
        email: row.email,
        detail: new Date(row.created_at).toLocaleString(),
        pills: [{ id: 'admin', label: 'Admin' }],
      }))
  }
  if (tier === 'Partner') {
    return members
      .filter((member) => holdsSponsorSeat(member))
      .map((member) => ({
        email: member.email,
        detail: `${seatLabel(member.seat)} · ${member.status}`,
        pills: membershipTierPills(member),
      }))
  }
  if (tier === 'Founding Member') {
    return members
      .filter((member) => membershipTiersOf(member).includes('founding'))
      .map((member) => ({
        email: member.email,
        detail: `${seatLabel(member.seat)} · ${member.status}`,
        pills: membershipTierPills(member),
      }))
  }
  return members
    .filter((member) => membershipTiersOf(member).includes('member'))
    .map((member) => ({
      email: member.email,
      detail: `${seatLabel(member.seat)} · ${member.status}`,
      pills: membershipTierPills(member),
    }))
}

export function peerMeta(rows: MemberInviteAdminRow[], app: Application) {
  const row = rows.find(
    (item) => item.application_id === app.id || item.id === app.invite_token_id,
  )
  if (!row) return ''
  const channel = row.channel === 'whatsapp' ? 'WhatsApp' : 'Email'
  return `${channel} · ${row.status}`
}

export function PanelNotice() {
  return (
    <p role="alert" className="text-[0.95rem] leading-relaxed text-pearl/80">
      {ADMIN_PANEL_NOTICE}
    </p>
  )
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const tone =
    status === 'accepted' || status === 'verified' || status === 'admitted'
      ? 'border-transparent bg-[var(--ba-success)] text-[var(--ba-porcelain)]'
      : status === 'rejected' || status === 'declined'
        ? 'text-red-300 border-red-300/30'
        : 'text-brass-bright border-brass/40'

  return (
    <span
      className={`border px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.08em] uppercase ${tone}`}
    >
      {status}
    </span>
  )
}

export function DryRunInviteBox({ invite }: { invite: DryRunInvite }) {
  return (
    <div className="max-w-2xl border border-brass/40 px-4 py-4 text-[0.9rem] text-stone/80">
      <p className="font-semibold text-brass-bright">Dry-run invite. Not emailed. Do not forward.</p>
      {invite.confirmUrl && (
        <p className="mt-3 break-all">
          <a
            href={invite.confirmUrl}
            className="text-brass-bright underline-offset-2 hover:underline"
          >
            {invite.confirmUrl}
          </a>
        </p>
      )}
      {invite.otp && <p className="mt-2">One-time code: {invite.otp}</p>}
      {invite.tempPassword && <p className="mt-2">Temporary password: {invite.tempPassword}</p>}
      {invite.loginUrl && <p className="mt-2 break-all">{invite.loginUrl}</p>}
    </div>
  )
}
