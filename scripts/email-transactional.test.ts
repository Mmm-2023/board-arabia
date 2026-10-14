import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { MEMBER_NOTICE_TYPES, memberNoticeMail, PRIVACY_PATH } from '../supabase/functions/_shared/member_notice_copy.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20261229120000_email_transactional.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const hooked = [
  'supabase/functions/admit-member/index.ts',
  'supabase/functions/_shared/candidate_flow.ts',
  'supabase/functions/_shared/candidate_admin.ts',
  'supabase/functions/suggest-intros/index.ts',
  'supabase/functions/send-member-invite/index.ts',
  'supabase/functions/invite-sponsor/index.ts',
  'supabase/functions/_shared/deal_room.ts',
  'supabase/functions/_shared/deal_room_http.ts',
  'supabase/functions/majlis-reminders/index.ts',
  'supabase/functions/_shared/majlis_notify.ts',
  'supabase/functions/delete-candidate-account/index.ts',
  'supabase/functions/retention-sweep/index.ts',
  'src/pages/dashboard/TwoStepPage.tsx',
]

test('transactional migration is the named slot and does not send or schedule', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'))
  assert.equal(names.includes(migrationName), true)
  assert.equal(names.filter((name) => name.startsWith('20261229120000')).length, 1)
  assert.equal(names.includes('20261221120000_email_sender.sql'), false)
  assert.equal(names.includes('20261223120000_email_transactional.sql'), false)
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  assert.equal(/master_enabled\s*=\s*true/i.test(sql), false)
  assert.match(sql, /alter table public\.email_outbox enable row level security/)
  assert.match(sql, /alter table public\.email_outbox force row level security/)
  assert.match(sql, /revoke all on table public\.email_outbox from public, anon, authenticated, service_role/)
  assert.match(sql, /kind in \('bulk', 'transactional', 'essential'\)/)
  assert.match(sql, /member_can_disable = false/)
  assert.match(sql, /errcode = '22023'/)
  assert.match(sql, /email_sends_notice_once/)
  assert.match(sql, /constraint email_outbox_once unique \(type_key, ref_id, user_id\)/)
  assert.equal(/grant execute on function private\.enqueue_member_notice\(text, uuid, uuid, jsonb\) to anon/.test(sql), false)
  assert.equal(/grant execute on function private\.enqueue_member_notice\(text, uuid, uuid, jsonb\) to authenticated/.test(sql), false)
  assert.equal(/grant execute on function private\.transactional_eligible\(text, uuid\) to anon/.test(sql), false)
  const code = sql.replace(/--.*$/gm, '')
  const grants = code.split(';').filter((statement) => /^\s*grant\b/i.test(statement))
  assert.equal(grants.some((statement) => /\bto\s+anon\b/i.test(statement)), false)
  const chunks = sql.split(/create or replace function /i).slice(1)
  assert.ok(chunks.length >= 8)
  for (const chunk of chunks) {
    const header = chunk.slice(0, chunk.search(/as\s+\$fn\$/i))
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
  assert.match(sql, /revoke all on function public\.staff_decide_mandate_intro\(uuid, text\) from public, anon/)
  assert.match(sql, /grant execute on function public\.staff_decide_mandate_intro\(uuid, text\) to authenticated/)
  assert.match(sql, /revoke all on function public\.staff_decide_digest_issue\(text\) from public, anon/)
  assert.match(sql, /grant execute on function public\.staff_decide_digest_issue\(text\) to authenticated/)
  assert.match(sql, /perform private\.enqueue_member_notice/)
})

test('hooks queue notices and do not name the provider', () => {
  const dispatcher = read('supabase/functions/_shared/member_notice.ts')
  assert.equal(/resend|gmail|googleapis/i.test(dispatcher), false)
  assert.match(read('supabase/functions/admit-member/index.ts'), /enqueueMemberNotice/)
  assert.match(read('supabase/functions/_shared/candidate_flow.ts'), /enqueueNotice/)
  assert.match(read('supabase/functions/suggest-intros/index.ts'), /intro_suggested/)
  assert.match(read('supabase/functions/send-member-invite/index.ts'), /typeKey: 'invite'/)
  assert.match(read('supabase/functions/invite-sponsor/index.ts'), /typeKey: 'invite'/)
  assert.match(read('supabase/functions/_shared/deal_room.ts'), /typeKey: 'invite'/)
  assert.match(read('supabase/functions/majlis-reminders/index.ts'), /stableNoticeRef/)
  assert.match(read('supabase/functions/_shared/majlis_notify.ts'), /event_reminder/)
  assert.match(read('supabase/functions/delete-candidate-account/index.ts'), /security_deletion/)
  assert.match(read('supabase/functions/retention-sweep/index.ts'), /security_deletion/)
  assert.match(read('src/pages/dashboard/TwoStepPage.tsx'), /record-security-notice/)
  assert.match(read('src/pages/admin/NewsletterReadySetting.tsx'), /newsletter_ready/)
  assert.match(read('src/components/privacy/PrivacyPanelView.tsx'), /Email notifications/)
  assert.match(read('src/components/privacy/PrivacyPanelView.tsx'), /Coming soon/)
  assert.match(read('src/components/privacy/PrivacyPanelView.tsx'), /Account security emails: always on/)
  assert.match(read('src/App.tsx'), /path="privacy"/)
  assert.match(read('src/App.tsx'), /path="settings"/)
  assert.match(read('supabase/config.toml'), /\[functions\.member-notice-send\]\s+verify_jwt = true/)
  assert.match(read('supabase/config.toml'), /\[functions\.record-security-notice\]\s+verify_jwt = true/)
  for (const file of hooked) {
    const source = read(file)
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(/api\.resend\.com/i.test(source), false, file)
  }
  assert.match(read('supabase/functions/majlis-approve/index.ts'), /status: 'published'/)
  assert.equal(/sendEmail|resend|gmail/i.test(read('supabase/functions/majlis-approve/index.ts')), false)
  const inviteReminders = read('.github/workflows/invite-reminders.yml')
  const admitReminders = read('.github/workflows/admit-li-share-reminders.yml')
  assert.equal(inviteReminders.includes('member-notice'), false)
  assert.equal(admitReminders.includes('member-notice'), false)
  assert.equal(inviteReminders.includes('majlis-reminders'), false)
  const added = [
    'supabase/functions/member-notice-send/index.ts',
    'supabase/functions/record-security-notice/index.ts',
    'supabase/functions/_shared/member_notice_send.ts',
  ]
  for (const file of added) {
    assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(read(file)), false, file)
  }
})

test('each notice template keeps the footer rules and the privacy link', () => {
  const contact = 'notices@example.com'
  const site = 'https://example.com'
  for (const typeKey of MEMBER_NOTICE_TYPES) {
    const essential = typeKey.startsWith('security_')
    const mail = memberNoticeMail({
      typeKey,
      contactEmail: contact,
      site,
      unsubscribeUrl: essential ? null : `https://example.com/functions/v1/email-unsubscribe?t=${typeKey}-token`,
    })
    assert.equal(mail.essential, essential, typeKey)
    assert.equal(mail.text.includes('\u2014'), false, typeKey)
    assert.equal(mail.html.includes('\u2014'), false, typeKey)
    assert.equal(/\bsponsor\b/i.test(mail.text + mail.html), false, typeKey)
    assert.equal(/resend|gmail|google/i.test(mail.text + mail.html), false, typeKey)
    assert.equal(/\$\d/.test(mail.text + mail.html), false, typeKey)
    assert.match(mail.text, /powered by nammco/)
    assert.equal(mail.text.split('nammco').length, 2, typeKey)
    assert.match(mail.text, new RegExp(contact.replace('.', '\\.')))
    if (essential) {
      assert.match(mail.text, /cannot be turned off/)
      assert.equal(mail.text.includes('Turn off'), false, typeKey)
      assert.equal(mail.html.includes('email-unsubscribe'), false, typeKey)
    } else {
      assert.match(mail.text, new RegExp(`${PRIVACY_PATH}`))
      assert.match(mail.text, /Turn off/)
      assert.match(mail.html, /email-unsubscribe/)
    }
  }
  assert.equal(memberNoticeMail({
    typeKey: 'message_new',
    contactEmail: contact,
    site,
    unsubscribeUrl: 'https://example.com/functions/v1/email-unsubscribe?t=message',
  }).subject.includes('New message'), true)
})
