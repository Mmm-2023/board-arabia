const EMAIL_KIND_LABELS: Record<string, string> = {
  desk_note: 'Member note',
  desk_request: 'Member note',
  applicant_ack: 'Admission email',
  admin_notify: 'Admin notice',
  accept_private_booking: 'Admission email',
  reject_decline: 'Admission email',
  member_invite: 'Admission email',
  password_reset: 'Password email',
  peer_invite: 'Member invite',
  peer_invite_reminder: 'Member invite',
  sponsor_invite: 'Partner invite',
  admit_linkedin_share: 'Admission email',
  admit_li_share: 'Admission email',
  admit_li_share_reminder: 'Admission email',
  admit_li_share_dry_run: 'Admission email',
  intro_pending_nudge: 'Introduction',
  intro_meet_nudge: 'Introduction',
  review_call: 'Admission email',
  request_received: 'Admission email',
  needs_info: 'Admission email',
  waitlisted: 'Admission email',
  declined: 'Admission email',
  membership_live: 'Admission email',
}

/** Plain label for an email event. Unknown kinds stay generic. Never a raw code or an address. */
export function emailEventLabel(kind: string): string {
  return EMAIL_KIND_LABELS[kind] ?? 'Email'
}
