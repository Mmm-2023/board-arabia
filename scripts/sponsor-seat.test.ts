import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { hasBoardFooter, hasSubstantiveBody, marketingSignatureHit } from '../supabase/functions/_shared/mail.ts'
import {
  FOUNDING_SEATS,
  MEMBER_SEATS,
  SPONSOR_CAP,
  isFoundingSeat,
  isMemberSeat,
  sponsorSeatAllowed,
} from '../supabase/functions/_shared/sponsor_seat.ts'
import { sponsorInviteMail } from '../supabase/functions/_shared/transactional_copy.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20260923170000_sponsor_seat.sql', import.meta.url),
  'utf8',
)
const founding = readFileSync(
  new URL('../supabase/migrations/20260922201000_member_invite_wallet.sql', import.meta.url),
  'utf8',
)
const invite = readFileSync(
  new URL('../supabase/functions/invite-sponsor/index.ts', import.meta.url),
  'utf8',
)
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
const statusFn = readFileSync(
  new URL('../supabase/functions/set-member-status/index.ts', import.meta.url),
  'utf8',
)

function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}`)
  assert.ok(start >= 0, name)
  return source.slice(start)
}

test('founding seats stay ksa and intl, and sponsor is only a member seat', () => {
  assert.deepEqual(FOUNDING_SEATS, ['ksa', 'intl'])
  assert.deepEqual(MEMBER_SEATS, ['ksa', 'intl', 'sponsor'])
  assert.equal(isFoundingSeat('ksa'), true)
  assert.equal(isFoundingSeat('intl'), true)
  assert.equal(isFoundingSeat('sponsor'), false)
  assert.equal(isMemberSeat('sponsor'), true)
  assert.equal(isMemberSeat('staff'), false)
  assert.match(migration, /check \(seat in \('ksa', 'intl', 'sponsor'\)\)/)
})

test('sponsor cap fails closed at 3 invited or active', () => {
  assert.equal(SPONSOR_CAP, 3)
  assert.equal(sponsorSeatAllowed(0), true)
  assert.equal(sponsorSeatAllowed(2), true)
  assert.equal(sponsorSeatAllowed(3), false)
  assert.equal(sponsorSeatAllowed(4), false)
  assert.equal(sponsorSeatAllowed(-1), false)
  assert.equal(sponsorSeatAllowed(2.5), false)
  assert.match(migration, /if taken >= 3 then/)
  assert.match(migration, /raise exception 'sponsor_cap'/)
  assert.match(migration, /status in \('invited', 'active'\)/)
  assert.match(invite, /sponsorSeatAllowed/)
  assert.match(statusFn, /sponsor_cap/)
  assert.match(statusFn, /Sponsor seats are full \(3\)/)
})

test('claim_sponsor_seat is service_role only and does not touch staff or founding capacity', () => {
  const body = functionBody(migration, 'public.claim_sponsor_seat')
  assert.match(body, /auth\.role\(\) is distinct from 'service_role'/)
  assert.match(body, /raise exception 'forbidden'/)
  assert.match(body, /email, seat, status, must_set_password/)
  assert.match(body, /'sponsor'/)
  assert.match(body, /'invited'/)
  assert.match(body, /true/)
  assert.match(body, /invites_granted, invites_remaining/)
  assert.match(body, /0,\s*\n\s*0/)
  assert.match(body, /grant execute on function public\.claim_sponsor_seat/)
  assert.match(body, /to service_role/)
  assert.equal(body.includes('staff_users'), false)
  assert.equal(body.includes('founding_seat'), false)
  assert.equal(body.includes('claim_founding_seat'), false)
  assert.match(migration, /new\.seat = 'sponsor'/)
  assert.match(migration, /new\.invites_granted := 0/)
  assert.match(migration, /new\.invites_remaining := 0/)
  assert.match(migration, /m\.seat in \('ksa', 'intl'\)/)
})

test('claim_founding_seat still rejects sponsor', () => {
  const body = functionBody(founding, 'public.claim_founding_seat')
  assert.match(body, /if p_seat not in \('ksa', 'intl'\) then/)
  assert.match(body, /raise exception 'invalid_seat'/)
  assert.equal(body.includes("'sponsor'"), false)
  assert.equal(migration.includes('create function public.claim_founding_seat'), false)
  assert.equal(migration.includes('create or replace function public.claim_founding_seat'), false)
})

test('invite-sponsor is staff-gated, uses claim_sponsor_seat, and does not hardcode mailboxes', () => {
  assert.match(invite, /requireStaff\(/)
  assert.match(invite, /issueCredential\(/)
  assert.match(invite, /claim_sponsor_seat/)
  assert.match(invite, /sendEmail\(/)
  assert.match(invite, /sponsorInviteMail/)
  assert.match(invite, /calendar\\\.app\\\.google\|nammco/)
  assert.equal(invite.includes('claim_founding_seat'), false)
  assert.equal(invite.includes('staff_users'), false)
  assert.equal(invite.includes('invite-master'), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(invite), false)
  assert.equal(invite.includes('https://calendar'), false)
  assert.equal(invite.includes('\u2014'), false)
  assert.match(config, /\[functions\.invite-sponsor\]/)
  assert.match(config, /verify_jwt = true/)
})

test('sponsor invite mail is a set-password letter without a booking link', () => {
  const magic = sponsorInviteMail({
    greeting: 'Ada',
    loginUrl: 'https://boardarabia.com/login?next=/dashboard',
    confirmUrl: 'https://boardarabia.com/auth/confirm?token_hash=example&type=invite',
    issued: { mode: 'magic_link', otp: '123456' },
  })
  const temp = sponsorInviteMail({
    greeting: 'Ada',
    loginUrl: 'https://boardarabia.com/login?next=/dashboard',
    confirmUrl: null,
    issued: { mode: 'temp_password', tempPassword: 'temporary-secret' },
  })
  for (const mail of [magic, temp]) {
    assert.equal(mail.subject, 'Board Arabia: your sponsor invitation')
    assert.equal(hasBoardFooter(mail.text, mail.html), true)
    assert.equal(hasSubstantiveBody(mail.text, mail.html), true)
    assert.equal(marketingSignatureHit(mail.text, mail.html), null)
    assert.match(mail.text, /as a sponsor/)
    assert.match(mail.text, /set a password/)
    assert.equal(/calendar\.app\.google|nammco|book(?:ing)?/i.test(`${mail.subject}\n${mail.text}\n${mail.html}`), false)
    assert.equal(mail.text.includes('\u2014'), false)
    assert.equal(mail.html.includes('\u2014'), false)
    assert.equal(/founding member/i.test(mail.text), false)
  }
  assert.match(magic.text, /one-time code/)
  assert.match(magic.text, /123456/)
  assert.match(temp.text, /Temporary password: temporary-secret/)
})
