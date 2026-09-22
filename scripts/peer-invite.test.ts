import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRfc822,
  hasBoardFooter,
  marketingSignatureHit,
  workspaceFromAddress,
} from '../supabase/functions/_shared/mail.ts'
import {
  applyInviteUrl,
  peerInviteMail,
  whatsAppInviteText,
  whatsAppInviteUrl,
} from '../supabase/functions/_shared/peer_invite.ts'
import {
  applyInviteUrl as clientApplyUrl,
  whatsAppInviteText as clientWhatsAppText,
  whatsAppInviteUrl as clientWhatsAppUrl,
} from '../src/lib/inviteLink.ts'

const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCdefg'
const applyUrl = applyInviteUrl('https://boardarabia.com/', token)

test('apply link is the public consider path with an unguessable token slot', () => {
  assert.equal(applyUrl, `https://boardarabia.com/apply?invite=${token}`)
  assert.equal(applyUrl.includes('calendar.app.google'), false)
  assert.equal(clientApplyUrl('https://boardarabia.com', token), applyUrl)
})

test('peer invite mail is Board Arabia only', () => {
  const mail = peerInviteMail(applyUrl, 'Layla Hassan')
  assert.equal(mail.subject, 'Board Arabia: a personal invitation')
  assert.equal(hasBoardFooter(mail.text, mail.html), true)
  assert.equal(marketingSignatureHit(mail.text, mail.html), null)
  assert.equal(mail.text.includes('\u2014'), false)
  assert.equal(mail.html.includes('\u2014'), false)
  assert.equal(/calendar\.app\.google/i.test(mail.text + mail.html), false)
  assert.equal(/nammco/i.test(mail.text + mail.html), false)
  assert.match(mail.text, /does not skip review/)
  assert.match(mail.text, /Layla Hassan/)
  const raw = buildRfc822({
    from: workspaceFromAddress(),
    to: 'guest@example.com',
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
  assert.match(raw, /From: "Board Arabia" <noreply@boardarabia.com>/)
  assert.match(raw, /Reply-To: cindy@nammco.com/)
  assert.equal(raw.includes('\u2014'), false)
})

test('WhatsApp url carries the same apply link', () => {
  const withPhone = whatsAppInviteUrl('966500000000', applyUrl)
  const bare = whatsAppInviteUrl(null, applyUrl)
  assert.equal(withPhone.startsWith('https://wa.me/966500000000?text='), true)
  assert.equal(bare.startsWith('https://wa.me/?text='), true)
  assert.equal(decodeURIComponent(withPhone.split('text=')[1] || ''), whatsAppInviteText(applyUrl))
  assert.equal(clientWhatsAppUrl('966500000000', applyUrl), withPhone)
  assert.equal(clientWhatsAppText(applyUrl), whatsAppInviteText(applyUrl))
  assert.equal(/calendar\.app\.google|nammco/i.test(withPhone + bare), false)
  assert.equal((withPhone + bare).includes('\u2014'), false)
})
