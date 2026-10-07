import { SPONSOR_CAP, sponsorSeatAllowed } from '../../supabase/functions/_shared/sponsor_seat.ts'

export { SPONSOR_CAP }

export type SponsorSeatRow = {
  seat: string
  status: string
  tiers?: readonly string[] | null
}

export type SponsorCapView = {
  cap: number
  taken: number
  remaining: number
  full: boolean
}

/** Invited and active sponsor rows. A combined tier counts. Suspended sponsors do not hold a seat. */
export function holdsSponsorSeat(row: SponsorSeatRow): boolean {
  if (row.status !== 'invited' && row.status !== 'active') return false
  if (row.seat === 'sponsor') return true
  return (row.tiers ?? []).includes('sponsor')
}

export function sponsorSeatHolders<T extends SponsorSeatRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => holdsSponsorSeat(row))
}

export function sponsorCapView(rows: readonly SponsorSeatRow[]): SponsorCapView {
  const taken = sponsorSeatHolders(rows).length
  return {
    cap: SPONSOR_CAP,
    taken,
    remaining: Math.max(0, SPONSOR_CAP - taken),
    full: !sponsorSeatAllowed(taken),
  }
}

export function sponsorAddDisabled(input: {
  capKnown: boolean
  full: boolean
  submitting: boolean
}): boolean {
  return !input.capKnown || input.full || input.submitting
}

export function sponsorCapCopy(input: {
  capKnown: boolean
  countError: boolean
  full: boolean
  remaining: number
  cap: number
}): string {
  if (input.countError || !input.capKnown) {
    if (input.countError) {
      return 'Partner seats could not be counted. Retry before adding a partner.'
    }
    return 'Checking how many partner seats are left.'
  }
  if (input.full) {
    return `All ${input.cap} partner seats for this year are taken. Add partner stays off until a seat is free.`
  }
  const noun = input.remaining === 1 ? 'seat' : 'seats'
  return `${input.remaining} partner ${noun} remaining this year. This invite does not use a founding seat.`
}

export function firmByUserId(
  profiles: Readonly<Record<string, { company?: string | null } | null | undefined>>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const [id, profile] of Object.entries(profiles)) {
    const firm = profile?.company?.trim()
    out[id] = firm ? firm : null
  }
  return out
}

export function sponsorListRows<
  T extends SponsorSeatRow & { user_id: string; email: string },
>(rows: readonly T[], firmByUser: Readonly<Record<string, string | null | undefined>>) {
  return sponsorSeatHolders(rows).map((row) => ({
    userId: row.user_id,
    email: row.email,
    status: row.status,
    firm: firmByUser[row.user_id]?.trim() || null,
  }))
}
