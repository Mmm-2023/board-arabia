import type { AdminAlertInput } from './notify_admin.ts'

/** Names only. The desk mailbox stays in ADMIN_NOTIFY_EMAIL. */
export function deskIntroAlert(input: { requesterName: string; targetName: string }): AdminAlertInput {
  const requester = oneLine(input.requesterName) || 'Member'
  const target = oneLine(input.targetName) || 'Member'
  return {
    requesterName: requester,
    requesterKind: 'member',
    requested: 'a desk introduction',
    item: `Accepted introduction with ${target}`,
    approvePath: '/admin/people/intros',
  }
}

function oneLine(value: string): string {
  return value.replace(/[\r\n@]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}
