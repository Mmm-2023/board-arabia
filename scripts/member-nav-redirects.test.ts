import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { figuresAsOfLabel, formatInviteSent } from '../src/lib/riyadhStamp.ts'
import { redirectLocation, resolveRedirect } from '../src/shell/redirects.ts'

test('invite times use Riyadh parts and a fixed month list', () => {
  assert.equal(formatInviteSent('2026-09-25T13:33:18.000Z', 'pending'), 'Pending, sent 25 Sep 2026, 16:33')
  assert.equal(figuresAsOfLabel('2026-09-29T00:30:00.000Z'), 'Figures as of 29 Sep 2026')
  assert.equal(formatInviteSent('not-a-date', 'pending'), 'Pending')
})

test('old member routes resolve to the new homes and keep params', () => {
  assert.equal(resolveRedirect('/dashboard/mandates'), '/dashboard/deals/mandates')
  assert.equal(resolveRedirect('/dashboard/real-estate'), '/dashboard/deals/real-estate')
  assert.equal(resolveRedirect('/dashboard/rooms'), '/dashboard/deals/rooms')
  assert.equal(resolveRedirect('/dashboard/rooms/'), '/dashboard/deals/rooms')
  assert.equal(resolveRedirect('/dashboard/rooms/new'), '/dashboard/deals/rooms/new')
  assert.equal(
    resolveRedirect('/dashboard/rooms/11111111-1111-4111-8111-111111111111'),
    '/dashboard/deals/rooms/11111111-1111-4111-8111-111111111111',
  )
  assert.equal(resolveRedirect('/dashboard/directory'), '/dashboard/people/directory')
  assert.equal(resolveRedirect('/dashboard/network'), '/dashboard/people/invites')
  assert.equal(resolveRedirect('/dashboard/invites'), '/dashboard/people/invites')
  assert.equal(resolveRedirect('/dashboard/intros'), '/dashboard/people/intros')
  assert.equal(resolveRedirect('/dashboard/people/intros'), null)
  assert.equal(resolveRedirect('/dashboard/due-diligence'), '/dashboard/ai/due-diligence')
  assert.equal(
    resolveRedirect('/dashboard/due-diligence/22222222-2222-4222-8222-222222222222'),
    '/dashboard/ai/due-diligence/22222222-2222-4222-8222-222222222222',
  )
  assert.equal(resolveRedirect('/dashboard/events'), '/dashboard/majlis')
  assert.equal(resolveRedirect('/dashboard/no-such-page'), null)
  assert.equal(resolveRedirect('/dashboard'), null)
  assert.equal(resolveRedirect('/dashboard/profile'), null)
  assert.equal(resolveRedirect('/dashboard/help'), null)
  assert.equal(resolveRedirect('/dashboard/sponsorship'), null)
  assert.equal(resolveRedirect('/dashboard/deals/mandates'), null)
  assert.equal(resolveRedirect('/dashboard/people/directory'), null)
  assert.equal(resolveRedirect('/dashboard/ai'), null)
})

test('redirects keep search and hash', () => {
  assert.deepEqual(
    redirectLocation({
      pathname: '/dashboard/network',
      search: '?from=old',
      hash: '#sent',
    }),
    { pathname: '/dashboard/people/invites', search: '?from=old', hash: '#sent' },
  )
  assert.deepEqual(
    redirectLocation({
      pathname: '/dashboard/events',
      search: '?event=11111111-1111-4111-8111-111111111111',
      hash: '',
    }),
    {
      pathname: '/dashboard/majlis',
      search: '?event=11111111-1111-4111-8111-111111111111',
      hash: '',
    },
  )
  assert.deepEqual(
    redirectLocation({
      pathname: '/dashboard/intros',
      search: '',
      hash: '',
    }),
    { pathname: '/dashboard/people/intros', search: '', hash: '' },
  )
  assert.equal(
    redirectLocation({ pathname: '/dashboard/profile', search: '', hash: '#password' }),
    null,
  )
})

test('the app wires replace redirects and the rooms/new shell', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /path="invites" element=\{<RedirectKeep/)
  assert.match(app, /path="intros" element=\{<RedirectKeep/)
  assert.match(app, /path="rooms\/:roomId" element=\{<RedirectKeep/)
  assert.match(app, /path="\*" element=\{<RedirectKeep/)
  const prerender = readFileSync(new URL('../scripts/prerender.mjs', import.meta.url), 'utf8')
  assert.match(prerender, /dashboard\/rooms\/new/)
  assert.match(prerender, /dashboard\/deals\/rooms\/new/)
})
