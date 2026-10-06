import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { deskIntroAlert } from '../supabase/functions/_shared/desk_intro_alert.ts'
import { cleanDeskNote, deskNoteLetter, DESK_TOPICS } from '../supabase/functions/_shared/desk_note.ts'
import { statusCopy, STEP_COPY } from '../supabase/functions/_shared/membership_steps.ts'
import { introDealError } from '../src/lib/introFunnel.ts'
import { deskIntroLine } from '../src/lib/memberIntros.ts'
import { RE_PARTNER_STAFF } from '../src/lib/rePartnerView.ts'
import { formatUpdated } from '../src/shell/destinations.ts'
import { MEMBER_VIEWS, STAFF_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(new URL('..', import.meta.url).pathname)

const EDGE_COPY = [
  'supabase/functions/_shared/membership_copy.ts',
  'supabase/functions/_shared/membership_steps.ts',
  'supabase/functions/_shared/desk_note.ts',
  'supabase/functions/_shared/desk_intro_alert.ts',
  'supabase/functions/contact-desk/index.ts',
  'supabase/functions/request-membership/index.ts',
]

/** User-facing team name. Internal ids such as desk-intros and recipient 'desk' stay. */
const BANNED = [
  /\bthe desk\b/i,
  />Desk</,
  /\bDesk [A-Z]/,
  /\bthis desk\b/i,
  /\bdesk contacts?\b/i,
  /\bdesk intros?\b/i,
  /\bdesk introductions?\b/i,
  /\ba desk introduction\b/i,
  /\bdesk notes?\b/i,
  /\bDesk (intro|intros|contact|email|phone|record|note)\b/,
]

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function walkSrc(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkSrc(full, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.test\.(ts|tsx)$/.test(entry)) continue
    const rel = path.relative(root, full).split(path.sep).join('/')
    if (rel === 'src/components/WhoRunsTheDesk.tsx') continue
    out.push(rel)
  }
}

test('user-facing copy says admin, and the locked Who runs the desk block stays', () => {
  const files: string[] = []
  walkSrc(path.join(root, 'src'), files)
  files.push(...EDGE_COPY)
  const hits: string[] = []
  for (const rel of files) {
    const text = stripComments(read(rel))
    for (const pattern of BANNED) {
      if (pattern.test(text)) hits.push(`${rel} ${pattern}`)
    }
  }
  assert.deepEqual(hits, [])

  const who = read('src/components/WhoRunsTheDesk.tsx')
  assert.match(who, /Who runs the desk/)
  assert.match(who, /Michael Mateer, Co-Founder and CEO/)
  assert.match(who, /A named person reads applications\. There is no public booking calendar\./)
  assert.equal(who.replace(/Who runs the desk/g, '').toLowerCase().includes('the desk'), false)

  assert.equal(STAFF_VIEWS.home.denied, 'This page is for admin.')
  assert.equal(STAFF_VIEWS.settings.optional, 'Nothing here is published on the marketing site.')
  assert.equal(STAFF_VIEWS.settings.optional.includes('Optional desk notes'), false)
  assert.equal(MEMBER_VIEWS.realEstate.rolesInventory, 'Admin record of this seat.')
  assert.equal(introDealError('not_allowed'), 'This page is for admin.')
  assert.equal(RE_PARTNER_STAFF.denied, 'This page is for admin.')
  assert.match(RE_PARTNER_STAFF.lead, /admin contacts/)
  assert.match(RE_PARTNER_STAFF.declineBody, /Admin contacts stay off the member page/)
  assert.equal(
    deskIntroLine({ kind: 'member', status: 'accepted', direction: 'incoming', ask_desk: true, desk_status: 'queued' }, 'staff'),
    'Admin intro queued',
  )
  assert.equal(
    deskIntroLine({ kind: 'member', status: 'pending', direction: 'incoming', ask_desk: true }, 'staff'),
    'Admin intro if accepted',
  )
  assert.equal(formatUpdated(new Date('2026-09-23T09:05:00.000Z')), 'Updated 12:05 AST')
  assert.equal(formatUpdated(null), null)

  assert.match(STEP_COPY.email.why, /our admin team/)
  assert.equal(STEP_COPY.email.why.toLowerCase().includes('the desk'), false)
  assert.match(statusCopy('in_review', null, null), /Our admin team is reviewing your request/)
  assert.match(statusCopy('submitted', '2026-09-30T08:00:00.000Z', null), /Our admin team reviews every request personally/)
  const short = cleanDeskNote({ topic: 'Majlis', message: 'Too short' })
  assert.equal(short.ok, false)
  if (!short.ok) assert.equal(short.error, 'Write a few words so our admin team can help.')
  const letter = deskNoteLetter({ name: 'Member', topic: 'Majlis', message: 'The gathering date looks wrong for my seat.' })
  assert.match(letter.subject, /^Member note from Member: Majlis/)
  assert.equal(deskIntroAlert({ requesterName: 'Member', targetName: 'Member' }).requested, 'an admin introduction')

  const help = read('src/pages/dashboard/HelpPage.tsx')
  assert.match(help, /Write to our admin team/)
  assert.match(help, /Send to our admin team/)
  assert.match(help, /id="desk"/)
  const queue = read('src/pages/admin/DeskIntrosQueue.tsx')
  assert.match(queue, /Admin intros/)
  assert.match(queue, /id="desk-intros"/)
  assert.match(queue, /data-desk-status/)
  const contact = read('supabase/functions/contact-desk/index.ts')
  assert.match(contact, /recipient: 'desk'/)
  assert.match(contact, /kind: 'desk_note'/)
  assert.match(contact, /Could not reach admin\. Try again\./)
  assert.match(contact, /Admin already has several notes from you this hour/)
  const request = read('supabase/functions/request-membership/index.ts')
  assert.match(request, /Admin is not waiting on a reply\./)
  assert.match(read('supabase/functions/_shared/membership_dispatch.ts'), /to: 'desk', kind: 'desk_request'/)
  assert.deepEqual(DESK_TOPICS, ['Seat', 'Invites', 'Intros', 'Majlis', 'Deal rooms', 'Privacy', 'Something else'])
})

test('privacy notice is not rendered, and the old desk sentence is absent', () => {
  const src: string[] = []
  walkSrc(path.join(root, 'src'), src)
  const importers = src.filter((rel) => rel !== 'src/content/privacyNotice.ts' && read(rel).includes('PRIVACY_NOTICE_EN'))
  assert.deepEqual(importers, [])
  const notice = read('src/content/privacyNotice.ts')
  assert.equal(notice.toLowerCase().includes('the desk'), false)
  assert.equal(notice.includes('for the desk'), false)
  assert.match(read('src/components/Footer.tsx'), /CONSENT_COPY/)
  assert.equal(read('src/components/Footer.tsx').includes('PRIVACY_NOTICE_EN'), false)
  assert.equal(read('src/components/ConsentBanner.tsx').includes('PRIVACY_NOTICE_EN'), false)
})
