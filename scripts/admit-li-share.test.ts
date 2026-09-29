import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { MEMBER_DESTINATIONS } from '../src/shell/destinations.ts'
import { safeAdmitShareHref } from '../src/lib/admitShareHref.ts'
import {
  ADMIT_LI_SHARE_REMINDER_AFTER_MS,
  admitLiReminderMail,
  admitLiShareDryRunTo,
  admitLiShareEmailEnabled,
  admitLiShareMail,
  admitLiShareSample,
  admitShareBrandBlocked,
  admitShareClickUrl,
  admitShareReminderDue,
  deliverAdmitShareReminders,
  envFlagOn,
  firstName,
  isLinkedInShareUrl,
  linkedInPostText,
  linkedInShareUrl,
  newAdmitShareToken,
  requestIsPrefetch,
  roleLine,
  sendDedicatedAdmitShare,
  shareSeat,
  type AdmitShareReminderRow,
} from '../supabase/functions/_shared/admit_li_share.ts'
import { hasBoardFooter, marketingSignatureHit } from '../supabase/functions/_shared/mail.ts'
import { admitMail } from '../supabase/functions/_shared/transactional_copy.ts'

const DASHBOARD = 'https://boardarabia.com/dashboard'

function assertClean(label: string, subject: string, text: string, html: string) {
  const blob = `${subject}\n${text}\n${html}`
  assert.equal(blob.includes('\u2014'), false, `${label} em dash`)
  assert.equal(blob.includes('\u2013'), false, `${label} en dash`)
  assert.equal(/\{[a-z_]+\}|\{\{/.test(blob), false, `${label} placeholder`)
  assert.equal(/nammco|sme marketer/i.test(blob), false, `${label} brand`)
  assert.equal(/#0F3912/i.test(html), false, `${label} green`)
  assert.match(html, /#1C1343/)
  assert.match(html, /#F6F5FB/)
  assert.match(html, /#4B3F9A/)
  assert.match(html, /min-height:44px/)
  assert.match(html, /white-space:pre-wrap/)
  assert.equal(hasBoardFooter(text, html), true, label)
  assert.equal(marketingSignatureHit(text, html), null, label)
  assert.equal(/<img\b|calendly|calendar\.app\.google/i.test(blob), false, label)
}

test('flags are on only for the exact string true', () => {
  assert.equal(envFlagOn(undefined), false)
  assert.equal(envFlagOn(''), false)
  assert.equal(envFlagOn('false'), false)
  assert.equal(envFlagOn('TRUE'), false)
  assert.equal(envFlagOn('1'), false)
  assert.equal(envFlagOn(' true '), true)
  assert.equal(admitLiShareEmailEnabled(() => undefined), false)
  assert.equal(admitLiShareEmailEnabled((name) => (name.endsWith('_ENABLED') ? 'false' : undefined)), false)
  assert.equal(admitLiShareEmailEnabled((name) => (name === 'ADMIT_LI_SHARE_EMAIL_ENABLED' ? 'true' : undefined)), true)
})

test('share letter fills the locked copy and resolves placeholders', () => {
  const postText = linkedInPostText({
    founding: true,
    seatLabel: 'Founding Member',
    headline: 'Operator',
    company: 'Example House',
  })
  const mail = admitLiShareMail({
    firstName: 'Layla',
    seatLabel: 'Founding Member',
    postText,
    dashboardUrl: DASHBOARD,
    shareUrl: linkedInShareUrl(postText),
  })
  assert.equal(mail.subject, 'Layla, your Board Arabia seat is live')
  assert.equal(mail.preheader, 'A short LinkedIn draft, written for you. Share it only if you want to.')
  assert.match(mail.html, /Welcome to Board Arabia/)
  assert.match(mail.text, /Dear Layla,/)
  assert.match(mail.text, /Your Founding Member seat is live\./)
  assert.match(mail.text, /You publish it yourself; we never post on your behalf\./)
  assert.match(mail.text, /Your draft post:/)
  assert.match(mail.postText, /I am honoured to be admitted as a Founding Member of Board Arabia\./)
  assert.match(mail.postText, /Operator at Example House/)
  assert.match(mail.postText, /access to capital, business relationships and opening doors/)
  assert.match(mail.postText, /boardarabia\.com/)
  assert.equal(mail.postText.includes('\n\n\n'), false)
  assert.equal(mail.shareUrl.startsWith('https://www.linkedin.com/feed/?shareActive=true&text='), true)
  assert.equal(decodeURIComponent(mail.shareUrl.split('text=')[1] || ''), mail.postText)
  assert.equal(isLinkedInShareUrl(mail.shareUrl), true)
  assert.match(mail.text, /Share on LinkedIn:\nhttps:\/\/www\.linkedin\.com\/feed\//)
  assert.match(mail.text, /Go to your dashboard:\nhttps:\/\/boardarabia\.com\/dashboard/)
  assert.match(mail.html, /Share on LinkedIn/)
  assert.match(mail.html, /Go to your dashboard/)
  assert.match(mail.text, /Sharing is optional\. If you prefer to keep your membership private, simply ignore this email\./)
  assert.match(mail.text, /The Board Arabia team/)
  assert.match(mail.text, /Board Arabia\. Private founding membership by review\./)
  assert.match(mail.text, /You received this because your seat was admitted\. We never post to LinkedIn without you\./)
  assertClean('share', mail.subject, mail.text, mail.html)

  const escaped = admitLiShareMail({
    firstName: 'A < B',
    seatLabel: 'Founding Member',
    postText: linkedInPostText({ founding: true, seatLabel: 'Founding Member', headline: 'A < B', company: null }),
    dashboardUrl: DASHBOARD,
    shareUrl: linkedInShareUrl('A < B'),
  })
  assert.match(escaped.html, /A &lt; B/)
  assert.equal(escaped.html.includes('<script'), false)
})

test('an empty role line drops out with its blank line', () => {
  assert.equal(roleLine(' ', null), null)
  assert.equal(roleLine('Operator', 'Example House'), 'Operator at Example House')
  assert.equal(roleLine('Operator', ' '), 'Operator')
  assert.equal(roleLine('', 'Example House'), 'Example House')
  const bare = linkedInPostText({ founding: true, seatLabel: 'Founding Member', headline: ' ', company: null })
  assert.equal(bare.includes('\n\n\n'), false)
  assert.equal(
    bare.startsWith('I am honoured to be admitted as a Founding Member of Board Arabia.\n\nBoard Arabia connects'),
    true,
  )
  assert.equal(firstName('Layla Hassan'), 'Layla')
  assert.equal(firstName('  '), 'there')
  assert.deepEqual(shareSeat('ksa'), { seatLabel: 'Founding Member', founding: true })
  assert.deepEqual(shareSeat('intl'), { seatLabel: 'Founding Member', founding: true })
  const sponsor = linkedInPostText({ founding: false, seatLabel: 'Sponsor', headline: null, company: null })
  assert.equal(sponsor.startsWith('I am honoured to join Board Arabia as a Sponsor.\n\nBoard Arabia connects'), true)
  assert.equal(sponsor.includes('\n\n\n'), false)
})

test('flag off does not send and leaves the admit letter unchanged', async () => {
  const letter = admitMail({
    greeting: 'Layla Hassan',
    seatLabel: 'Saudi Arabia',
    loginUrl: 'https://boardarabia.com/login?next=/dashboard',
    confirmUrl: null,
    issued: { mode: 'temp_password', tempPassword: 'example-temp' },
  })
  assert.equal(letter.subject, 'Board Arabia: your member invitation')
  assert.match(letter.text, /You have been admitted to Board Arabia as a founding member/)
  assert.equal(letter.text.includes('Share on LinkedIn'), false)
  assert.equal(letter.text.includes('your Board Arabia seat is live'), false)
  assert.equal(readFileSync('supabase/functions/_shared/transactional_copy.ts', 'utf8').includes('Share on LinkedIn'), false)
  assert.equal(readFileSync('supabase/functions/invite-sponsor/index.ts', 'utf8').includes('admit_li_share'), false)

  let claims = 0
  let sends = 0
  const skipped = await sendDedicatedAdmitShare({
    enabled: false,
    to: 'member@example.com',
    firstName: 'Layla',
    seatLabel: 'Founding Member',
    founding: true,
    dashboardUrl: DASHBOARD,
    clickBase: 'https://example.supabase.co/functions/v1',
    claim: async () => {
      claims += 1
      return { token: newAdmitShareToken(), postText: 'post' }
    },
    release: async () => {},
    send: async () => {
      sends += 1
      return { status: 'sent' }
    },
  })
  assert.equal(skipped.status, 'skipped')
  assert.equal(skipped.detail, 'flag_off')
  assert.equal(claims, 0)
  assert.equal(sends, 0)

  const admit = readFileSync('supabase/functions/admit-member/index.ts', 'utf8')
  const branchStart = admit.indexOf('if (!dedicatedShare)')
  const branch = admit.slice(branchStart, admit.indexOf('kind: dedicatedShare'))
  assert.match(branch, /if \(!dedicatedShare\)/)
  assert.match(branch, /deliverAdmitShare\(/)
  assert.match(branch, /sendDedicatedAdmitShare\(/)
  assert.ok(branch.indexOf('deliverAdmitShare') < branch.indexOf('sendDedicatedAdmitShare'))
  assert.match(admit, /kind: dedicatedShare \? 'admit_li_share' : 'admit_linkedin_share'/)
})

test('a dedicated share send is claimed once', async () => {
  const row: { sentAt: string | null; token: string | null; postText: string | null } = {
    sentAt: null,
    token: null,
    postText: null,
  }
  let sends = 0
  let releases = 0
  const claim = (input: { token: string; postText: string }) => {
    if (row.sentAt) return null
    row.sentAt = '2026-09-29T12:00:00.000Z'
    row.token = input.token
    row.postText = input.postText
    return { token: input.token, postText: input.postText }
  }
  const run = () =>
    sendDedicatedAdmitShare({
      enabled: true,
      to: 'member@example.com',
      firstName: 'Layla',
      seatLabel: 'Founding Member',
      founding: true,
      headline: 'Operator',
      company: 'Example House',
      dashboardUrl: DASHBOARD,
      clickBase: 'https://example.supabase.co/functions/v1',
      claim,
      release: () => {
        releases += 1
        row.sentAt = null
      },
      send: async (message) => {
        sends += 1
        assert.match(message.subject, /Layla, your Board Arabia seat is live/)
        assert.match(message.text, /admit-li-share-go\?t=/)
        assert.equal(message.to, 'member@example.com')
        return { status: 'sent' }
      },
    })
  const [first, second] = await Promise.all([run(), run()])
  assert.equal(sends, 1)
  assert.equal(releases, 0)
  assert.equal([first.status, second.status].filter((status) => status === 'sent').length, 1)
  assert.equal([first.status, second.status].includes('skipped'), true)
  const again = await run()
  assert.equal(again.status, 'skipped')
  assert.equal(again.detail, 'already_sent')
  assert.equal(sends, 1)
})

test('a dry-run or error releases the share claim', async () => {
  let sentAt: string | null = null
  let attempt = 0
  const run = () =>
    sendDedicatedAdmitShare({
      enabled: true,
      to: 'member@example.com',
      firstName: 'Layla',
      seatLabel: 'Founding Member',
      founding: true,
      dashboardUrl: DASHBOARD,
      clickBase: 'https://example.supabase.co/functions/v1',
      claim: (input) => {
        if (sentAt) return null
        sentAt = new Date().toISOString()
        return { token: input.token, postText: input.postText }
      },
      release: () => {
        sentAt = null
      },
      send: async () => {
        attempt += 1
        return { status: attempt === 1 ? 'dry_run' : 'sent' }
      },
    })
  const dry = await run()
  assert.equal(dry.status, 'dry_run')
  assert.equal(sentAt, null)
  const sent = await run()
  assert.equal(sent.status, 'sent')
  assert.equal(attempt, 2)
  const extra = await run()
  assert.equal(extra.status, 'skipped')
  assert.equal(attempt, 2)
})

test('reminder copy keeps the shell and drops the dashboard line', () => {
  const postText = linkedInPostText({ founding: true, seatLabel: 'Founding Member', company: 'Example House' })
  const mail = admitLiReminderMail({
    memberName: 'Layla',
    tier: 'Founding Member',
    postText,
    shareUrl: linkedInShareUrl(postText),
  })
  assert.equal(mail.subject, 'Still useful: your Board Arabia LinkedIn draft')
  assert.equal(mail.preheader, 'One quiet reminder. Share only if you want to.')
  assert.match(mail.text, /Your draft is still here/)
  assert.match(mail.text, /A single reminder, Layla\. Your Founding Member LinkedIn draft is ready if you want it\. No pressure either way\./)
  assert.match(mail.html, /Your draft post/)
  assert.match(mail.html, /Share on LinkedIn/)
  assert.equal(mail.text.includes('Go to your dashboard'), false)
  assert.equal(mail.html.includes('Go to your dashboard'), false)
  assert.match(mail.text, /Board Arabia\. Private founding membership by review\./)
  assertClean('reminder', mail.subject, mail.text, mail.html)
})

function reminderRow(now: Date, patch: Partial<AdmitShareReminderRow> = {}): AdmitShareReminderRow {
  return {
    userId: 'member-1',
    email: 'member@example.com',
    sentAt: new Date(now.getTime() - ADMIT_LI_SHARE_REMINDER_AFTER_MS).toISOString(),
    clickedAt: null,
    reminderSentAt: null,
    suppressedAt: null,
    optedOutAt: null,
    status: 'active',
    ...patch,
  }
}

test('the reminder is due only after 3 days when its flag is on', () => {
  const now = new Date('2026-09-29T12:00:00.000Z')
  assert.equal(admitShareReminderDue(reminderRow(now), now, true), true)
  assert.equal(admitShareReminderDue(reminderRow(now), now, false), false)
  assert.equal(
    admitShareReminderDue(
      reminderRow(now, { sentAt: new Date(now.getTime() - ADMIT_LI_SHARE_REMINDER_AFTER_MS + 1).toISOString() }),
      now,
      true,
    ),
    false,
  )
  assert.equal(admitShareReminderDue(reminderRow(now, { clickedAt: now.toISOString() }), now, true), false)
  assert.equal(admitShareReminderDue(reminderRow(now, { reminderSentAt: now.toISOString() }), now, true), false)
  assert.equal(admitShareReminderDue(reminderRow(now, { suppressedAt: now.toISOString() }), now, true), false)
  assert.equal(admitShareReminderDue(reminderRow(now, { optedOutAt: now.toISOString() }), now, true), false)
  assert.equal(admitShareReminderDue(reminderRow(now, { status: 'suspended' }), now, true), false)
  assert.equal(admitShareReminderDue(reminderRow(now, { email: null }), now, true), false)
  assert.equal(admitShareReminderDue(reminderRow(now, { sentAt: null }), now, true), false)
})

test('overlapping reminder runs send once and a dry-run does not consume it', async () => {
  const now = new Date('2026-09-29T12:00:00.000Z')
  const row = reminderRow(now)
  let sends = 0
  const claim = (item: AdmitShareReminderRow) => {
    if (item.reminderSentAt) return false
    item.reminderSentAt = now.toISOString()
    return true
  }
  const run = () =>
    deliverAdmitShareReminders({
      enabled: true,
      now,
      due: [row],
      claim,
      release: (item) => {
        item.reminderSentAt = null
      },
      send: async () => {
        sends += 1
        return { status: 'sent' }
      },
    })
  const [first, second] = await Promise.all([run(), run()])
  assert.equal(sends, 1)
  assert.equal(first.sent + second.sent, 1)
  const again = await run()
  assert.equal(again.sent, 0)
  assert.equal(sends, 1)

  const fresh = reminderRow(now)
  const dry = await deliverAdmitShareReminders({
    enabled: true,
    now,
    due: [fresh],
    claim,
    release: (item) => {
      item.reminderSentAt = null
    },
    send: async () => ({ status: 'dry_run' }),
  })
  assert.equal(dry.dryRun, true)
  assert.equal(fresh.reminderSentAt, null)
  const quiet = await deliverAdmitShareReminders({
    enabled: false,
    now,
    due: [reminderRow(now)],
    claim: () => true,
    release: () => {},
    send: async () => {
      throw new Error('should not send')
    },
  })
  assert.equal(quiet.sent, 0)
})

test('dry run uses the edge secret and never a request address', () => {
  assert.equal(admitLiShareDryRunTo(() => undefined), null)
  assert.equal(
    admitLiShareDryRunTo((name) => (name === 'ADMIT_LI_SHARE_DRYRUN_TO' ? 'staff@example.com' : undefined)),
    'staff@example.com',
  )
  assert.equal(
    admitLiShareDryRunTo((name) => (name === 'ADMIT_ALERT_TO' ? 'ops@example.com' : undefined)),
    'ops@example.com',
  )
  const sample = admitLiShareSample('share')
  assert.match(sample.text, /Dear Layla,/)
  assert.match(sample.postText, /Example House/)
  assert.equal(sample.text.includes('@'), false)
  const source = readFileSync('supabase/functions/admit-li-share-dry-run/index.ts', 'utf8')
  assert.match(source, /requireStaff\(/)
  assert.match(source, /admitLiShareDryRunTo\(/)
  assert.equal(source.includes('body.to'), false)
  assert.equal(source.includes('body.email'), false)
  assert.equal(/\.user_metadata|\.app_metadata|body\.role/.test(source), false)
})

test('click tracking is first party and ignores prefetch', () => {
  const token = newAdmitShareToken()
  const click = admitShareClickUrl('https://example.supabase.co/functions/v1', token)
  assert.ok(click)
  assert.equal(safeAdmitShareHref(click), new URL(click!).toString())
  assert.equal(safeAdmitShareHref('https://evil.example/admit-li-share-go?t=' + token), null)
  assert.equal(safeAdmitShareHref('http://example.supabase.co/functions/v1/admit-li-share-go?t=' + token), null)
  assert.equal(isLinkedInShareUrl('https://evil.example/feed/?shareActive=true&text=Hi'), false)
  assert.equal(requestIsPrefetch((name) => (name === 'purpose' ? 'prefetch' : null)), true)
  assert.equal(requestIsPrefetch(() => null), false)
  const go = readFileSync('supabase/functions/admit-li-share-go/index.ts', 'utf8')
  assert.ok(go.indexOf('requestIsPrefetch') < go.indexOf('mark_admit_li_share_clicked'))
  assert.match(go, /linkedInShareUrl\(post\)/)
  assert.equal(go.includes("searchParams.get('url')"), false)
  assert.equal(go.includes('requireStaff'), false)
})

test('the home card is server gated and the five hubs stay put', () => {
  assert.deepEqual(
    MEMBER_DESTINATIONS.map((item) => item.label),
    ['Home', 'Deals', 'People', 'Majlis', 'AI tools'],
  )
  const card = readFileSync('src/pages/dashboard/AdmitShareCard.tsx', 'utf8')
  assert.match(card, /Share your admission/)
  assert.match(card, /Share on LinkedIn/)
  assert.match(card, /Optional\. We never post for you\./)
  assert.match(card, /min-h-11/)
  assert.match(card, /#1C1343/)
  assert.match(card, /#F6F5FB/)
  const client = [
    'src/lib/admitShareCard.ts',
    'src/lib/admitShareHref.ts',
    'src/pages/dashboard/AdmitShareCard.tsx',
    'src/pages/dashboard/DashboardHome.tsx',
    'src/pages/dashboard/HomeSnapshotView.tsx',
  ].map((file) => readFileSync(file, 'utf8')).join('\n')
  assert.equal(client.includes('ADMIT_LI_SHARE_EMAIL_ENABLED'), false)
  assert.equal(client.includes('ADMIT_LI_SHARE_HOME_CARD_ENABLED'), false)
  assert.equal(client.includes('ADMIT_LI_SHARE_REMINDER_ENABLED'), false)
  assert.equal(client.includes('ADMIT_LI_SHARE_DRYRUN_TO'), false)
  assert.equal(client.includes('\u2014'), false)
  assert.equal(client.includes('\u2013'), false)
  const home = readFileSync('src/pages/dashboard/HomeSnapshotView.tsx', 'utf8')
  assert.match(home, /shareSlot/)
})

test('migration and scheduler stay behind the flag', () => {
  const sql = readFileSync('supabase/migrations/20261010120000_admit_li_share.sql', 'utf8')
  assert.ok('20261010120000' > '20261009120000')
  assert.match(sql, /sent_at is null/)
  assert.match(sql, /interval '3 days'/)
  assert.match(sql, /clicked_at is null/)
  assert.match(sql, /reminder_sent_at is null/)
  assert.match(sql, /suppressed_at is null/)
  assert.match(sql, /opted_out_at is null/)
  assert.match(sql, /function public\.claim_admit_li_share_send/)
  assert.match(sql, /function public\.release_admit_li_share_send/)
  assert.match(sql, /function public\.claim_admit_li_share_reminder/)
  assert.match(sql, /grant execute on function public\.claim_admit_li_share_send/)
  assert.match(sql, /to service_role/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  const config = readFileSync('supabase/config.toml', 'utf8')
  assert.match(config, /\[functions\.admit-li-share-dry-run\][\s\S]*verify_jwt = true/)
  assert.match(config, /\[functions\.admit-li-share-card\][\s\S]*verify_jwt = true/)
  assert.match(config, /\[functions\.admit-li-share-go\][\s\S]*verify_jwt = false/)
  assert.match(config, /\[functions\.remind-admit-li-share\][\s\S]*verify_jwt = false/)
  const remind = readFileSync('supabase/functions/remind-admit-li-share/index.ts', 'utf8')
  assert.ok(remind.indexOf('admitLiShareReminderEnabled') < remind.indexOf('due_admit_li_share_reminders'))
  assert.match(remind, /ADMIT_LI_SHARE_REMINDER_SECRET/)
  const workflow = readFileSync('.github/workflows/admit-li-share-reminders.yml', 'utf8')
  assert.match(workflow, /ADMIT_LI_SHARE_REMINDER_SECRET is unset/)
  assert.match(workflow, /x-admit-li-share-reminder/)
  assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(workflow), false)
  const card = readFileSync('supabase/functions/admit-li-share-card/index.ts', 'utf8')
  assert.ok(card.indexOf('admitLiShareHomeCardEnabled') < card.indexOf('ensure_admit_li_share_token'))
  assert.equal(card.includes('requireStaff'), false)
})

test('new share files keep mailboxes on example.com and avoid dashes', () => {
  const files = [
    'supabase/functions/_shared/admit_li_share.ts',
    'supabase/functions/admit-li-share-dry-run/index.ts',
    'supabase/functions/admit-li-share-card/index.ts',
    'supabase/functions/admit-li-share-go/index.ts',
    'supabase/functions/remind-admit-li-share/index.ts',
    'supabase/migrations/20261010120000_admit_li_share.sql',
    'src/lib/admitShareCard.ts',
    'src/lib/admitShareHref.ts',
    'src/pages/dashboard/AdmitShareCard.tsx',
    '.github/workflows/admit-li-share-reminders.yml',
    '.env.example',
  ]
  const blob = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  const emails = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  for (const email of emails) assert.match(email, /@example\.com$/i, email)
  assert.equal(blob.includes('\u2014'), false)
  assert.equal(blob.includes('\u2013'), false)
  assert.equal(/private_key|ya29\.|BEGIN /i.test(blob), false)
  assert.equal(admitShareBrandBlocked('nammco'), true)
  assert.equal(admitShareBrandBlocked('calendar.app.google'), true)
})
