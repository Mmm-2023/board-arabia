import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { cleanDeskNote, deskNoteLetter } from '../supabase/functions/_shared/desk_note.ts'
import { cleanInviteeName, sentInviteLabel } from '../supabase/functions/_shared/invitee_name.ts'
import { recentReports, reportListTitle } from '../src/lib/recentReports.ts'
import { missingRecipientNameColumn } from '../src/lib/sentInvites.ts'
import { pages404Html } from './spa-fallback.mjs'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('recent reports fix titles, drop repeats, and keep five', () => {
  assert.equal(
    reportListTitle('ÒMade In KSAÓ Gateway to Centralized Economy', 'deck.pdf'),
    'Made In KSA Gateway to Centralized Economy',
  )
  assert.equal(
    reportListTitle('W H O W H A T G O E S W R O N G W H A T I T C O S T S', 'notes.pdf'),
    'Who What Goes Wrong What it Costs',
  )
  assert.equal(
    reportListTitle('C O N F I D E N T I A L · M A N A G E M E N T C A S E', 'case.pdf'),
    'Confidential · Management Case',
  )
  assert.equal(reportListTitle('Jahez International Company', 'jahez.pdf'), 'Jahez International Company')
  assert.equal(reportListTitle('Not stated in the deck', 'Northwind Logistics.pdf'), 'Northwind Logistics')

  const rows = recentReports([
    { id: '1', company_label: 'Jahez International Company', file_name: 'a.pdf' },
    { id: '2', company_label: 'W H O W H A T G O E S W R O N G W H A T I T C O S T S', file_name: 'b.pdf' },
    { id: '3', company_label: 'Jahez International Company', file_name: 'c.pdf' },
    { id: '4', company_label: 'ÒMade In KSAÓ Gateway to Centralized Economy', file_name: 'd.pdf' },
    { id: '5', company_label: 'ÒMade In KSAÓ Gateway to Centralized Economy', file_name: 'e.pdf' },
    { id: '6', company_label: 'Goldman Capital Consortium', file_name: 'f.pdf' },
    { id: '7', company_label: 'Goldman Capital Consortium', file_name: 'g.pdf' },
    { id: '8', company_label: 'C O N F I D E N T I A L · M A N A G E M E N T C A S E', file_name: 'h.pdf' },
  ])
  assert.deepEqual(
    rows.map((row) => row.title),
    [
      'Jahez International Company',
      'Who What Goes Wrong What it Costs',
      'Made In KSA Gateway to Centralized Economy',
      'Goldman Capital Consortium',
      'Confidential · Management Case',
    ],
  )
  assert.deepEqual(
    rows.map((row) => row.id),
    ['1', '2', '4', '6', '8'],
  )
})

test('invitee names stay on the sent card and off the public lookup', () => {
  assert.equal(cleanInviteeName('  Layla Hassan  '), 'Layla Hassan')
  assert.equal(cleanInviteeName('A'), 'A')
  assert.equal(cleanInviteeName('   '), null)
  assert.equal(cleanInviteeName('12345'), null)
  assert.equal(cleanInviteeName('x'.repeat(81)), null)
  assert.deepEqual(
    sentInviteLabel({ channel: 'whatsapp', recipient_name: 'Layla Hassan', recipient_phone: null }),
    { title: 'Layla Hassan', detail: 'WhatsApp' },
  )
  assert.deepEqual(
    sentInviteLabel({ channel: 'whatsapp', recipient_name: null, recipient_phone: null }),
    { title: 'WhatsApp', detail: '' },
  )
  assert.equal(missingRecipientNameColumn({ code: 'PGRST204', message: 'Could not find recipient_name in the schema cache' }), true)
  assert.equal(missingRecipientNameColumn({ code: '42501', message: 'permission denied' }), false)

  const lookup = read('supabase/migrations/20260922201000_member_invite_wallet.sql')
  const fn = lookup.slice(lookup.indexOf('function public.lookup_member_invite'))
  assert.equal(fn.includes('recipient_name'), false)
  assert.match(fn, /inviter_label/)
  const added = read('supabase/migrations/20261019120000_member_invite_recipient_name.sql')
  assert.match(added, /recipient_name/)
  assert.equal(/create or replace function public.lookup_member_invite/i.test(added), false)
  assert.equal(added.includes('\u2014'), false)
})

test('staff home counts sponsor seats instead of a fixed zero', () => {
  const home = read('src/pages/admin/AdminHome.tsx')
  assert.match(home, /sponsorSeatHolders\(room\.members\)/)
  const at = home.indexOf('Sponsors')
  assert.ok(at > 0)
  const sponsors = home.slice(at, at + 280)
  assert.match(sponsors, /\{sponsors\}/)
  assert.equal(sponsors.includes('>0<'), false)
})

test('help answers and the desk note do not hardcode an email', () => {
  const help = read('src/pages/dashboard/HelpPage.tsx')
  const edge = read('supabase/functions/contact-desk/index.ts')
  const note = read('supabase/functions/_shared/desk_note.ts')
  for (const file of [help, edge, note]) {
    assert.equal(file.includes('\u2014'), false, file.slice(0, 40))
    assert.equal(file.includes('\u2013'), false)
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(file), false)
  }
  assert.match(help, /How do introductions work/)
  assert.match(help, /Who can see a deal room/)
  assert.match(help, /How does Majlis work/)
  assert.match(help, /What stays private/)
  assert.match(help, /sendDeskNote/)
  assert.match(edge, /adminNotifyEmail\(/)
  assert.match(edge, /recipient: 'desk'/)
  assert.equal(cleanDeskNote({ topic: 'Majlis', message: 'Too short' }).ok, false)
  const cleaned = cleanDeskNote({ topic: 'Majlis', message: 'The gathering date looks wrong for my seat.' })
  assert.equal(cleaned.ok, true)
  if (cleaned.ok) {
    const letter = deskNoteLetter({ name: 'Member', topic: cleaned.topic, message: cleaned.message })
    assert.match(letter.subject, /Desk note from Member: Majlis/)
    assert.match(letter.text, /The gathering date looks wrong/)
    assert.equal(letter.text.includes('@'), false)
  }
})

test('github pages deep links bounce through the app shell', () => {
  const shell = '<html><head><title>Board Arabia</title></head><body><script>ba-spa-redirect</script></body></html>'
  const page = pages404Html(shell, '/')
  assert.match(page, /data-ba-spa-fallback/)
  assert.match(page, /location\.replace\("\/shell\.html"\)/)
  assert.equal(pages404Html(page, '/'), page)
  assert.equal(shell.includes('location.replace'), false)
  assert.match(read('index.html'), /ba-spa-redirect/)
  assert.equal(read('index.html').includes('location.replace'), false)
  assert.match(read('scripts/prerender.mjs'), /pages404Html\(shellHtml, pagesBase\)/)
  assert.match(read('.github/workflows/pages.yml'), /data-ba-spa-fallback/)
})
