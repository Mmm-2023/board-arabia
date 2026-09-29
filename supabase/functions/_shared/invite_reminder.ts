/** One reminder, seven days after an unused email invite.
 * The database claim is the real lock. This module is the same predicate, so tests can
 * prove a second overlapping run cannot send again.
 */

export const REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export type ReminderInvite = {
  id: string
  channel: string
  status: string
  applied_at: string | null
  application_id: string | null
  recipient_email: string | null
  created_at: string
  expires_at: string
  reminder_sent_at: string | null
}

export type ReminderSendStatus = 'sent' | 'dry_run' | 'error'

export function reminderEligible(row: ReminderInvite, now: Date): boolean {
  if (row.reminder_sent_at) return false
  if (row.channel !== 'email') return false
  if (row.status !== 'pending' && row.status !== 'opened') return false
  if (row.applied_at) return false
  if (row.application_id) return false
  if (!row.recipient_email) return false
  const created = Date.parse(row.created_at)
  const expires = Date.parse(row.expires_at)
  if (!Number.isFinite(created) || !Number.isFinite(expires)) return false
  if (created > now.getTime() - REMINDER_AFTER_MS) return false
  if (expires <= now.getTime()) return false
  return true
}

/** Mirrors claim_member_invite_reminder: one update wins, the other sees the stamp. */
export function claimReminder(row: ReminderInvite, now: Date): boolean {
  if (!reminderEligible(row, now)) return false
  row.reminder_sent_at = now.toISOString()
  return true
}

/** Clear the stamp only when the invite is still unused, so a failed send can retry once. */
export function releaseReminder(row: ReminderInvite): boolean {
  if (!row.reminder_sent_at) return false
  if (row.channel !== 'email') return false
  if (row.status !== 'pending' && row.status !== 'opened') return false
  if (row.applied_at || row.application_id) return false
  row.reminder_sent_at = null
  return true
}

export async function deliverInviteReminders<T extends ReminderInvite>(opts: {
  now: Date
  due: T[]
  claim: (row: T) => Promise<boolean> | boolean
  release: (row: T) => Promise<void> | void
  send: (row: T) => Promise<{ status: ReminderSendStatus }>
}): Promise<{ sent: number; failed: number; dryRun: boolean; skipped: number }> {
  let sent = 0
  let failed = 0
  let dryRun = false
  let skipped = 0
  for (const row of opts.due) {
    if (!reminderEligible(row, opts.now)) {
      skipped += 1
      continue
    }
    const claimed = await opts.claim(row)
    if (!claimed) {
      skipped += 1
      continue
    }
    const result = await opts.send(row)
    if (result.status === 'sent') {
      sent += 1
      continue
    }
    await opts.release(row)
    if (result.status === 'dry_run') {
      dryRun = true
      break
    }
    failed += 1
  }
  return { sent, failed, dryRun, skipped }
}
