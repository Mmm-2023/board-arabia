import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('password attention card uses the set-password label and keeps the profile hash', () => {
  const home = source('src/pages/dashboard/DashboardHome.tsx')
  assert.match(home, /title: 'Set your password'/)
  assert.match(
    home,
    /body: 'Set a password before you leave this session so your invite link is not the only way back in\.'/,
  )
  assert.match(home, /to: '\/dashboard\/profile#password'/)
  assert.match(home, /cta: 'Set password'/)
  assert.equal(home.includes('Replace the invitation before you leave this session.'), false)
  const profile = source('src/pages/dashboard/ProfilePage.tsx')
  assert.match(profile, /id="password"/)
  assert.match(profile, /hash !== '#password'/)
  assert.match(profile, /closest\('\.shell-main'\)/)
  assert.match(profile, /input\.focus/)
})

test('home does not show a dead availability status', () => {
  const home = source('src/pages/dashboard/DashboardHome.tsx')
  assert.equal(home.includes('Availability'), false)
  assert.equal(home.includes('Open, Selective, or At capacity'), false)
  assert.match(home, /cards=\{3\}/)
})

test('spent peer invites collapse the send forms behind one quiet banner', () => {
  const invites = source('src/pages/dashboard/InvitesPage.tsx')
  assert.match(invites, /Both peer invites are used\. Unused invites do not refill\./)
  assert.equal(invites.includes('Both invites are used. A third send is blocked.'), false)
  assert.match(invites, /to="\/dashboard\/help"/)
  assert.match(invites, /to="\/dashboard\/profile"/)
  const blocked = invites.slice(invites.indexOf('blocked ?'))
  const forms = blocked.indexOf(') : (')
  assert.ok(forms > 0)
  assert.equal(blocked.slice(0, forms).includes('<form'), false)
  assert.match(blocked.slice(forms), /<form/)
})

test('a disabled directory invite is not the primary button', () => {
  const directory = source('src/pages/dashboard/DirectoryEmpty.tsx')
  assert.match(directory, /prominent && ctas\.invite\.type === 'link'/)
  assert.match(directory, /loud \? primaryClass : `\$\{secondaryClass\}/)
})

test('member copy in this wave has no em dash', () => {
  const files = [
    'src/pages/dashboard/DashboardHome.tsx',
    'src/pages/dashboard/InvitesPage.tsx',
    'src/pages/dashboard/DirectoryEmpty.tsx',
    'src/pages/dashboard/ProfilePage.tsx',
    'src/shell/AppShell.tsx',
  ]
  for (const file of files) {
    assert.equal(source(file).includes('\u2014'), false, file)
  }
})
