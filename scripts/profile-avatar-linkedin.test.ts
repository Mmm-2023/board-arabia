import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  allowedProfileRedirect,
  LINKEDIN_COPY,
  linkedInConnectEnabled,
  officialLinkedInAuthorizeUrl,
} from '../src/lib/linkedinFlag.ts'

const root = new URL('..', import.meta.url)

function source(rel: string) {
  return readFileSync(new URL(rel, root), 'utf8')
}

const touched = [
  'src/lib/avatarImage.ts',
  'src/lib/linkedinFlag.ts',
  'src/lib/linkedinConnect.ts',
  'src/pages/dashboard/AvatarCircle.tsx',
  'src/pages/dashboard/OwnAvatar.tsx',
  'src/pages/dashboard/MemberAvatar.tsx',
  'src/pages/dashboard/LinkedInConnect.tsx',
  'src/pages/dashboard/ProfilePage.tsx',
  'src/pages/dashboard/DirectoryBoard.tsx',
  'src/pages/dashboard/DashboardLayout.tsx',
  'src/shell/AppShell.tsx',
  'supabase/functions/linkedin-oauth/index.ts',
  'supabase/migrations/20260929203000_member_avatar_peer_read.sql',
  'handoff/board-arabia-profile-avatar-linkedin-2026-09-23.md',
  'scripts/smoke/profile-main.tsx',
]

test('linkedin flag is on only for the exact string true', () => {
  assert.equal(linkedInConnectEnabled(undefined), false)
  assert.equal(linkedInConnectEnabled(''), false)
  assert.equal(linkedInConnectEnabled('false'), false)
  assert.equal(linkedInConnectEnabled('TRUE'), false)
  assert.equal(linkedInConnectEnabled('true'), true)
  assert.match(source('src/lib/linkedinFlag.ts'), /VITE_LINKEDIN_CONNECT/)
  assert.match(source('.env.example'), /VITE_LINKEDIN_CONNECT=false/)
  assert.doesNotMatch(source('.env.example'), /LINKEDIN_CLIENT_/)
})

test('linkedin copy matches the brief and has no em dash', () => {
  assert.equal(LINKEDIN_COPY.heading, 'Speed up with LinkedIn')
  assert.equal(LINKEDIN_COPY.connect, 'Connect LinkedIn')
  assert.equal(LINKEDIN_COPY.manual, 'Fill in manually')
  assert.equal(LINKEDIN_COPY.refresh, 'Refresh from LinkedIn')
  assert.equal(LINKEDIN_COPY.connected, 'LinkedIn connected')
  assert.match(LINKEDIN_COPY.body, /never see or store your LinkedIn password/)
  assert.equal(Object.values(LINKEDIN_COPY).join('\n').includes('\u2014'), false)
  const profile = source('src/pages/dashboard/ProfilePage.tsx')
  const connect = source('src/pages/dashboard/LinkedInConnect.tsx')
  assert.match(profile, /placement="signup"/)
  assert.match(profile, /placement="profile"/)
  assert.match(connect, /if \(!LINKEDIN_CONNECT_ENABLED\) return null/)
  assert.equal(/Connect LinkedIn/.test(source('src/pages/dashboard/MemberAvatar.tsx')), false)
})

test('authorize url and profile redirect stay on known hosts', () => {
  assert.equal(
    officialLinkedInAuthorizeUrl('https://www.linkedin.com/oauth/v2/authorization?response_type=code'),
    'https://www.linkedin.com/oauth/v2/authorization?response_type=code',
  )
  assert.equal(officialLinkedInAuthorizeUrl('https://evil.example/oauth/v2/authorization'), null)
  assert.equal(officialLinkedInAuthorizeUrl('http://www.linkedin.com/oauth/v2/authorization'), null)
  assert.equal(allowedProfileRedirect('https://boardarabia.com/dashboard/profile'), 'https://boardarabia.com/dashboard/profile')
  assert.equal(allowedProfileRedirect('https://www.boardarabia.com/dashboard/profile'), 'https://www.boardarabia.com/dashboard/profile')
  assert.equal(allowedProfileRedirect('http://127.0.0.1:5173/dashboard/profile'), 'http://127.0.0.1:5173/dashboard/profile')
  assert.equal(allowedProfileRedirect('https://boardarabia.com/dashboard/profile?code=1'), null)
  assert.equal(allowedProfileRedirect('https://example.com/dashboard/profile'), null)
})

test('avatar upload crops before storage and peer migration does not recreate the bucket', () => {
  const avatar = source('src/pages/dashboard/MemberAvatar.tsx')
  assert.match(avatar, /prepareAvatarUpload/)
  assert.match(avatar, /upsert: true/)
  assert.match(source('src/lib/avatarImage.ts'), /drawImage/)
  const migration = source('supabase/migrations/20260929203000_member_avatar_peer_read.sql')
  assert.match(migration, /member_avatars_select_peers/)
  assert.match(migration, /Michael \/ Code PM applies this live/)
  assert.doesNotMatch(migration, /insert into storage\.buckets/i)
  assert.doesNotMatch(migration, /image\/webp/)
  assert.doesNotMatch(migration, /to anon/)
  assert.doesNotMatch(migration, /for insert/)
  assert.doesNotMatch(migration, /for update/)
  assert.doesNotMatch(migration, /for delete/)
  const home = source('src/pages/dashboard/DashboardHome.tsx')
  assert.equal(home.includes('OwnAvatar'), false)
  assert.equal(home.includes('prepareAvatarUpload'), false)
})

test('edge stub reads secret names from the environment and does not replace email', () => {
  const edge = source('supabase/functions/linkedin-oauth/index.ts')
  assert.match(edge, /Deno\.env\.get\('LINKEDIN_CLIENT_ID'\)/)
  assert.match(edge, /Deno\.env\.get\('LINKEDIN_CLIENT_SECRET'\)/)
  assert.match(edge, /not_configured/)
  assert.match(edge, /openid profile/)
  assert.doesNotMatch(edge, /email:/)
  assert.doesNotMatch(edge, /LINKEDIN_CLIENT_SECRET\s*=\s*['"][^'"]+['"]/)
  assert.doesNotMatch(edge, /eyJ[A-Za-z0-9_-]{20,}/)
  assert.match(source('supabase/config.toml'), /\[functions\.linkedin-oauth\]/)
  assert.match(source('src/lib/linkedinConnect.ts'), /linkedin-oauth/)
})

test('new profile files have no em dash, mailboxes, or credential material', () => {
  for (const file of touched) {
    const text = source(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(/calendar\.app\.google/i.test(text), false, file)
    assert.equal(/nammco/i.test(text), false, file)
    assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(text), false, file)
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
    for (const email of emails) {
      assert.match(email, /@example\.com$/i, `${file} ${email}`)
    }
  }
})
