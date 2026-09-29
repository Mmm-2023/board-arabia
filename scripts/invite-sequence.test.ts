import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { admitShareMail, deliverAdmitShare, linkedInPostBody, linkedInShareUrl } from '../supabase/functions/_shared/admit_share.ts'
import {
  claimReminder,
  deliverInviteReminders,
  releaseReminder,
  REMINDER_AFTER_MS,
  reminderEligible,
  type ReminderInvite,
} from '../supabase/functions/_shared/invite_reminder.ts'
import { hasBoardFooter, marketingSignatureHit, sendEmail } from '../supabase/functions/_shared/mail.ts'
import {
  BENEFIT_LINES,
  inviterAttr,
  peerInviteMail,
  peerInviteReminderMail,
  whatsAppInviteText,
} from '../supabase/functions/_shared/peer_invite.ts'

const applyUrl = 'https://boardarabia.com/apply?invite=abcdefghijklmnopqrstuvwxyz0123456789ABCdefg'
const inviter = { name: 'Layla Hassan', headline: 'Operator', company: 'Example House' }

function assertClean(label: string, subject: string, text: string, html: string) {
  const blob = `${subject}\n${text}\n${html}`
  assert.equal(blob.includes('\u2014'), false, `${label} em dash`)
  assert.equal(blob.includes('\u2013'), false, `${label} en dash`)
  assert.equal(/\{\{/.test(blob), false, `${label} placeholder`)
  assert.equal(/nammco|sme marketer/i.test(blob), false, `${label} brand`)
  assert.equal(/#0F3912/i.test(html), false, `${label} green`)
  assert.match(html, /#4b3f9a/)
  assert.equal(hasBoardFooter(text, html), true, label)
  assert.equal(marketingSignatureHit(text, html), null, label)
  assert.equal(/<img\b|powered by/i.test(blob), false, label)
}

test('invite letter fills the locked copy', () => {
  const mail = peerInviteMail(applyUrl, inviter)
  assert.equal(mail.subject, 'Layla Hassan vouched for you on Board Arabia')
  assert.equal(mail.preheader, 'A private founding seat invitation. Review still required.')
  assert.match(mail.html, /A private founding seat invitation\. Review still required\./)
  assert.match(mail.text, /You were vouched for by Layla Hassan \(Operator, Example House\)/)
  assert.match(mail.html, /You were vouched for by Layla Hassan \(Operator, Example House\)/)
  assert.match(mail.text, /not an automatic seat/)
  assert.match(mail.text, /Review the invitation:\nhttps:\/\/boardarabia\.com\/apply\?invite=/)
  for (const line of BENEFIT_LINES) {
    assert.match(mail.text, new RegExp(`- ${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    assert.match(mail.html, new RegExp(`<li>${line}</li>`))
  }
  assert.match(mail.text, /Board Arabia · Private founding cohort/)
  assert.match(mail.html, /Review the invitation/)
  assertClean('invite', mail.subject, mail.text, mail.html)
})

test('empty headline and company drop out of the attribution line', () => {
  assert.equal(inviterAttr({ name: 'Layla Hassan', headline: 'Operator', company: 'Example House' }), 'Layla Hassan (Operator, Example House)')
  assert.equal(inviterAttr({ name: 'Layla Hassan', headline: 'Operator', company: '  ' }), 'Layla Hassan (Operator)')
  assert.equal(inviterAttr({ name: 'Layla Hassan', headline: '', company: 'Example House' }), 'Layla Hassan (Example House)')
  assert.equal(inviterAttr({ name: 'Layla Hassan' }), 'Layla Hassan')
  const bare = peerInviteMail(applyUrl, { name: 'Layla Hassan', headline: ' ', company: null })
  assert.match(bare.text, /You were vouched for by Layla Hassan\n/)
  assert.equal(bare.text.includes('Layla Hassan ()'), false)
  assert.equal(bare.text.includes('( )'), false)
})

test('reminder is the short letter and still names the benefits in HTML', () => {
  const mail = peerInviteReminderMail(applyUrl, { name: 'Layla Hassan' })
  assert.equal(mail.subject, 'Still open: Layla Hassan\u2019s Board Arabia invitation')
  assert.equal(mail.preheader, 'One quiet reminder. The invite is still yours to review.')
  assert.match(mail.text, /Your invitation from Layla Hassan is still open/)
  assert.match(mail.text, /Nothing changes until you choose to apply\./)
  assert.equal(mail.text.includes('What members get'), false)
  assert.match(mail.html, /What members get/)
  assert.match(mail.html, /<li>Private deal rooms for live conversations<\/li>/)
  assert.match(mail.text, /Board Arabia · Private founding cohort\n?$/)
  assertClean('reminder', mail.subject, mail.text, mail.html)
})

test('WhatsApp share text is the locked name-only note', () => {
  const text = whatsAppInviteText(applyUrl, 'Layla Hassan')
  assert.equal(
    text,
    [
      'Layla Hassan vouched for you on Board Arabia.',
      '',
      'Private founding cohort for operators and capital around Saudi Arabia and the region. Layla Hassan used one of only two peer invites on their seat.',
      '',
      'This is an invitation to apply. Review is still required. Not an automatic admit.',
      '',
      'What members get:',
      '• Private directory when the cohort opens it',
      '• Warm intros when both sides agree',
      '• Admin-gated capital mandates',
      '• Private deal rooms',
      '• Founding cohort and majlis when scheduled',
      '',
      'Review the invitation:',
      applyUrl,
    ].join('\n'),
  )
  assert.equal(text.includes('\u2014'), false)
  assert.equal(/nammco/i.test(text), false)
})

test('invite mail dry-runs through the Workspace transport', async () => {
  const previous = process.env.GMAIL_FROM
  delete process.env.GMAIL_FROM
  delete process.env.GMAIL_CLIENT_ID
  delete process.env.GMAIL_CLIENT_SECRET
  delete process.env.GMAIL_REFRESH_TOKEN
  delete process.env.GMAIL_SERVICE_ACCOUNT_JSON
  const mail = peerInviteMail(applyUrl, inviter)
  let called = false
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    called = true
    return new Response('no send', { status: 500 })
  }
  try {
    const result = await sendEmail({
      to: 'guest@example.com',
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
    assert.equal(result.status, 'dry_run')
    assert.equal(result.dryRun, true)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = original
    if (previous === undefined) delete process.env.GMAIL_FROM
    else process.env.GMAIL_FROM = previous
  }
})

test('admit share letter prefills LinkedIn and does not post', async () => {
  const mail = admitShareMail({
    memberName: 'Layla Hassan',
    tier: 'Founding Member',
    headline: 'Operator',
    company: 'Example House',
    dashboardUrl: 'https://boardarabia.com/dashboard',
  })
  assert.equal(mail.subject, 'Your Board Arabia post is ready to share')
  assert.equal(mail.preheader, 'A short draft for LinkedIn. You publish when it feels right.')
  assert.match(mail.text, /Welcome, Layla Hassan\. Your Founding Member seat is live\./)
  assert.match(mail.text, /You publish; we do not post for you\./)
  assert.match(mail.postBody, /Honoured to be admitted as a Founding Member of Board Arabia\./)
  assert.match(mail.postBody, /Operator at Example House/)
  assert.match(mail.postBody, /boardarabia\.com/)
  assert.equal(mail.postBody.includes('\n\n\n'), false)
  assert.equal(mail.shareUrl.startsWith('https://www.linkedin.com/feed/?shareActive=true&text='), true)
  assert.equal(decodeURIComponent(mail.shareUrl.split('text=')[1] || ''), mail.postBody)
  assert.equal(/ugcPosts|\/v2\/shares|oauth/i.test(mail.shareUrl), false)
  assert.match(mail.html, /Share on LinkedIn/)
  assert.match(mail.text, /https:\/\/boardarabia\.com\/dashboard/)
  assertClean('admit', mail.subject, mail.text, mail.html)

  const bare = linkedInPostBody('Founding Member', ' ', null)
  assert.equal(bare.startsWith('Honoured to be admitted as a Founding Member of Board Arabia.\n\nBoard Arabia is'), true)
  assert.equal(bare.includes('\n\n\n'), false)
  assert.match(linkedInPostBody('Member', null, 'Example House'), /Honoured to join Board Arabia as a Member\.\n\nExample House/)
  assert.match(linkedInPostBody('Sponsor', 'Partner', null), /Proud to support Board Arabia as a Sponsor\.\n\nPartner/)
  assert.equal(linkedInShareUrl('Hello').includes('shareActive=true'), true)

  let sends = 0
  const delivered = await deliverAdmitShare(
    {
      to: 'guest@example.com',
      memberName: 'Layla Hassan',
      tier: 'Founding Member',
      dashboardUrl: 'https://boardarabia.com/dashboard',
    },
    async () => {
      sends += 1
      return { status: 'dry_run' }
    },
  )
  assert.equal(sends, 1)
  assert.equal(delivered.status, 'dry_run')
})

function row(now: Date, patch: Partial<ReminderInvite> = {}): ReminderInvite {
  return {
    id: 'invite-1',
    channel: 'email',
    status: 'pending',
    applied_at: null,
    application_id: null,
    recipient_email: 'guest@example.com',
    created_at: new Date(now.getTime() - REMINDER_AFTER_MS).toISOString(),
    expires_at: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    reminder_sent_at: null,
    ...patch,
  }
}

test('reminder eligibility is unused email invites at least 7 days old', () => {
  const now = new Date('2026-09-29T12:00:00.000Z')
  assert.equal(reminderEligible(row(now), now), true)
  assert.equal(reminderEligible(row(now, { status: 'opened' }), now), true)
  assert.equal(reminderEligible(row(now, { created_at: new Date(now.getTime() - REMINDER_AFTER_MS + 1).toISOString() }), now), false)
  assert.equal(reminderEligible(row(now, { channel: 'whatsapp', recipient_email: null }), now), false)
  assert.equal(reminderEligible(row(now, { status: 'applied', applied_at: now.toISOString(), application_id: 'app-1' }), now), false)
  assert.equal(reminderEligible(row(now, { status: 'accepted' }), now), false)
  assert.equal(reminderEligible(row(now, { status: 'rejected' }), now), false)
  assert.equal(reminderEligible(row(now, { status: 'admitted' }), now), false)
  assert.equal(reminderEligible(row(now, { expires_at: now.toISOString() }), now), false)
  assert.equal(reminderEligible(row(now, { reminder_sent_at: now.toISOString() }), now), false)
  assert.equal(reminderEligible(row(now, { recipient_email: null }), now), false)
})

test('overlapping reminder runs send once', async () => {
  const now = new Date('2026-09-29T12:00:00.000Z')
  const invite = row(now)
  let sends = 0
  const claim = async (item: ReminderInvite) => {
    await Promise.resolve()
    return claimReminder(item, now)
  }
  const run = () =>
    deliverInviteReminders({
      now,
      due: [invite],
      claim,
      release: (item) => {
        releaseReminder(item)
      },
      send: async () => {
        sends += 1
        await Promise.resolve()
        return { status: 'sent' }
      },
    })
  const [first, second] = await Promise.all([run(), run()])
  assert.equal(sends, 1)
  assert.equal(first.sent + second.sent, 1)
  const again = await run()
  assert.equal(again.sent, 0)
  assert.equal(sends, 1)
})

test('a failed reminder releases the claim and a later run sends once', async () => {
  const now = new Date('2026-09-29T12:00:00.000Z')
  const invite = row(now)
  let attempt = 0
  const run = () =>
    deliverInviteReminders({
      now,
      due: [invite],
      claim: (item) => claimReminder(item, now),
      release: (item) => {
        releaseReminder(item)
      },
      send: async () => {
        attempt += 1
        return { status: attempt === 1 ? 'error' : 'sent' }
      },
    })
  const failed = await run()
  assert.equal(failed.failed, 1)
  assert.equal(failed.sent, 0)
  assert.equal(invite.reminder_sent_at, null)
  const sent = await run()
  assert.equal(sent.sent, 1)
  assert.equal(attempt, 2)
  const extra = await run()
  assert.equal(extra.sent, 0)
  assert.equal(extra.skipped, 1)
  assert.equal(attempt, 2)
})

test('a dry-run does not consume the one reminder', async () => {
  const now = new Date('2026-09-29T12:00:00.000Z')
  const invite = row(now)
  const first = await deliverInviteReminders({
    now,
    due: [invite],
    claim: (item) => claimReminder(item, now),
    release: (item) => {
      releaseReminder(item)
    },
    send: async () => ({ status: 'dry_run' }),
  })
  assert.equal(first.dryRun, true)
  assert.equal(first.sent, 0)
  assert.equal(invite.reminder_sent_at, null)
  assert.equal(reminderEligible(invite, now), true)
})

test('a used invite cannot release back into the reminder queue', () => {
  const now = new Date('2026-09-29T12:00:00.000Z')
  const invite = row(now)
  assert.equal(claimReminder(invite, now), true)
  invite.status = 'applied'
  invite.applied_at = now.toISOString()
  invite.application_id = 'app-1'
  assert.equal(releaseReminder(invite), false)
  assert.ok(invite.reminder_sent_at)
})

test('the migration claims with a single guarded update', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260929220000_member_invite_reminder.sql', import.meta.url),
    'utf8',
  )
  const claim = sql.slice(sql.indexOf('function public.claim_member_invite_reminder'))
  assert.match(claim, /reminder_sent_at is null/)
  assert.match(claim, /channel = 'email'/)
  assert.match(claim, /status in \('pending', 'opened'\)/)
  assert.match(claim, /applied_at is null/)
  assert.match(claim, /application_id is null/)
  assert.match(claim, /interval '7 days'/)
  assert.match(claim, /expires_at > now\(\)/)
  assert.match(sql, /function public.release_member_invite_reminder/)
  assert.equal(sql.includes('\u2014'), false)
  const edge = readFileSync(
    new URL('../supabase/functions/remind-member-invites/index.ts', import.meta.url),
    'utf8',
  )
  assert.match(edge, /claim_member_invite_reminder/)
  assert.match(edge, /release_member_invite_reminder/)
  assert.match(edge, /INVITE_REMINDER_SECRET/)
  const claimAt = edge.indexOf("rpc('claim_member_invite_reminder'")
  const sendAt = edge.indexOf('await sendEmail(')
  assert.ok(claimAt > 0 && sendAt > claimAt)
  const workflow = readFileSync(new URL('../.github/workflows/invite-reminders.yml', import.meta.url), 'utf8')
  assert.match(workflow, /INVITE_REMINDER_SECRET is unset/)
  assert.match(workflow, /x-invite-reminder/)
  assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(workflow), false)
})

test('invites panel uses the locked labels', () => {
  const panel = readFileSync('src/pages/dashboard/InvitesPanel.tsx', 'utf8')
  assert.match(panel, /Two invites/)
  assert.match(panel, /\{remaining\} of 2 remaining/)
  assert.match(panel, /Unused invites do not refill\. People you invite are still reviewed\./)
  assert.match(panel, /Send email invite/)
  assert.match(panel, /Open WhatsApp/)
  assert.match(panel, /They\\u2019ll apply with your name attached/)
  assert.equal(panel.includes('\u2014'), false)
})

test('invite files keep mailboxes on example.com', () => {
  const files = [
    'supabase/functions/_shared/peer_invite.ts',
    'supabase/functions/_shared/admit_share.ts',
    'supabase/functions/_shared/invite_reminder.ts',
    'supabase/functions/remind-member-invites/index.ts',
    'src/pages/dashboard/InvitesPanel.tsx',
    'src/lib/inviteLink.ts',
    'src/pages/dashboard/InvitesPage.tsx',
    '.github/workflows/invite-reminders.yml',
  ]
  const blob = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  const emails = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  for (const email of emails) assert.match(email, /@example\.com$/i, email)
  assert.equal(blob.includes('\u2014'), false)
  assert.equal(/private_key|ya29\./i.test(blob), false)
  const panel = readFileSync('src/pages/dashboard/InvitesPanel.tsx', 'utf8')
  const link = readFileSync('src/lib/inviteLink.ts', 'utf8')
  assert.equal(/nammco|sme marketer/i.test(`${panel}\n${link}`), false)
})
