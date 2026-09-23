import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateAvatarFile } from '../src/lib/avatar.ts'
import {
  DIRECTORY_COPY,
  DIRECTORY_GHOST_COUNT,
  DIRECTORY_GHOST_COUNT_MOBILE,
  directoryCtas,
  isProfileReady,
  loadFoundingAdmitted,
  progressLine,
  readAdmittedCount,
} from '../src/lib/directoryGate.ts'

const uiFiles = [
  '../src/lib/directoryGate.ts',
  '../src/pages/dashboard/DirectoryEmpty.tsx',
  '../src/pages/dashboard/DirectoryPage.tsx',
  '../src/pages/dashboard/MemberAvatar.tsx',
  '../src/pages/dashboard/ModulePage.tsx',
]

test('profile is ready only with name, headline, and location', () => {
  assert.equal(isProfileReady(null), false)
  assert.equal(
    isProfileReady({ full_name: '  ', headline: 'Chair', location: 'Riyadh' }),
    false,
  )
  assert.equal(
    isProfileReady({ full_name: 'A Member', headline: '', location: 'Riyadh' }),
    false,
  )
  assert.equal(
    isProfileReady({ full_name: 'A Member', headline: 'Chair', location: 'Riyadh' }),
    true,
  )
})

test('CTA rule prefers a complete profile, then a remaining invite', () => {
  const incomplete = directoryCtas(false, 2)
  assert.equal(incomplete.primary, 'complete')
  assert.equal(incomplete.showComplete, false)
  assert.deepEqual(incomplete.invite, { type: 'link', remaining: 2, helper: '2 of 2 invites left' })

  const noneLeft = directoryCtas(false, 0)
  assert.equal(noneLeft.primary, 'complete')
  assert.equal(noneLeft.invite.type, 'disabled')
  assert.equal(noneLeft.invite.helper, 'No invites left')

  const ready = directoryCtas(true, 1)
  assert.equal(ready.primary, 'invite')
  assert.equal(ready.showComplete, true)
  assert.equal(ready.invite.helper, '1 of 2 invites left')

  const spent = directoryCtas(true, 0)
  assert.equal(spent.primary, 'invite')
  assert.equal(spent.showComplete, true)
  assert.equal(spent.invite.type, 'disabled')
  assert.equal(directoryCtas(true, -3).invite.type, 'disabled')
  assert.equal(directoryCtas(true, Number.NaN).invite.helper, 'No invites left')
})

test('admitted count is an integer from the source or an error', async () => {
  assert.equal(readAdmittedCount(0), 0)
  assert.equal(readAdmittedCount(12), 12)
  assert.equal(readAdmittedCount('7'), 7)
  assert.equal(readAdmittedCount(1.5), null)
  assert.equal(readAdmittedCount(-1), null)
  assert.equal(readAdmittedCount(null), null)
  assert.equal(readAdmittedCount('soon'), null)
  assert.equal(progressLine(0), '0 of 100 founding seats admitted')
  assert.equal(progressLine(12), '12 of 100 founding seats admitted')

  assert.deepEqual(await loadFoundingAdmitted(async () => ({ count: 4, failed: false })), {
    status: 'ready',
    admitted: 4,
  })
  assert.deepEqual(await loadFoundingAdmitted(async () => ({ count: null, failed: true })), {
    status: 'error',
  })
  assert.deepEqual(await loadFoundingAdmitted(async () => ({ count: 'nope', failed: false })), {
    status: 'error',
  })
  assert.deepEqual(
    await loadFoundingAdmitted(async () => {
      throw new Error('offline')
    }),
    { status: 'error' },
  )
})

test('directory copy has no em dash and no invented people', () => {
  const copy = Object.values(DIRECTORY_COPY).join('\n')
  assert.equal(copy.includes('\u2014'), false)
  assert.equal(copy.includes('No names on this page'), false)
  assert.match(copy, /Founding 100 is filling/)
  assert.match(copy, /Couldn’t refresh the seat count\./)
  assert.equal(DIRECTORY_GHOST_COUNT, 4)
  assert.equal(DIRECTORY_GHOST_COUNT_MOBILE, 3)
  for (const file of uiFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(/nammco/i.test(source), false, file)
  }
  const ghosts = readFileSync(new URL('../src/pages/dashboard/DirectoryEmpty.tsx', import.meta.url), 'utf8')
  assert.match(ghosts, /aria-hidden="true"/)
  assert.match(ghosts, /to="\/dashboard\/invites"/)
  assert.match(ghosts, /to="\/dashboard\/profile"/)
  assert.equal(ghosts.includes('<img'), false)
  assert.equal(ghosts.includes('No names on this page'), false)
  const modulePage = readFileSync(new URL('../src/pages/dashboard/ModulePage.tsx', import.meta.url), 'utf8')
  assert.equal(modulePage.includes('No names on this page'), false)
  assert.equal(modulePage.includes('directory:'), false)
})

test('avatar files stay small images and storage stays private to the member', () => {
  assert.equal(validateAvatarFile({ type: 'image/jpeg', size: 1000 }), null)
  assert.equal(validateAvatarFile({ type: 'image/jpg', size: 1000 }), null)
  assert.equal(validateAvatarFile({ type: 'image/gif', size: 1000 }), 'Use a JPG, PNG, or WebP under 2 MB.')
  assert.equal(
    validateAvatarFile({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }),
    'Use a JPG, PNG, or WebP under 2 MB.',
  )
  const migration = readFileSync(
    new URL('../supabase/migrations/20260923120000_member_avatar_storage.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /public = false/)
  assert.match(migration, /member-avatars/)
  assert.match(migration, /name = \(\(select auth\.uid\(\)\)::text \|\| '\/avatar'\)/)
  assert.doesNotMatch(migration, /public\.staff_users/)
  assert.doesNotMatch(migration, /alter table public\.staff/)
  assert.doesNotMatch(migration, /to anon/)
  assert.doesNotMatch(migration, /for select to public/)
  assert.equal(migration.includes('\u2014'), false)
})
