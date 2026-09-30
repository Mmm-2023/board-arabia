import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  AVATAR_ILLUSTRATION,
  DEFAULT_PICTURE_LABEL,
  avatarStylePatch,
  commitAvatarStyle,
  normalizeAvatarStyle,
  resolveAvatar,
} from '../src/lib/avatarStyle.ts'
import { presentDirectoryCard } from '../src/lib/demoRows.ts'

const root = new URL('..', import.meta.url)

function source(path: string) {
  return readFileSync(new URL(path, root), 'utf8')
}

test('avatar fallback prefers a photo, then the chosen illustration, then male', () => {
  assert.deepEqual(resolveAvatar({ photoUrl: 'https://example.com/photo.jpg', style: 'female' }), {
    kind: 'photo',
    src: 'https://example.com/photo.jpg',
  })
  assert.deepEqual(resolveAvatar({ photoUrl: '  https://example.com/photo.jpg  ', style: 'male' }), {
    kind: 'photo',
    src: 'https://example.com/photo.jpg',
  })
  assert.deepEqual(
    resolveAvatar({ photoUrl: 'https://example.com/photo.jpg', photoFailed: true, style: 'female' }),
    { kind: 'illustration', style: 'female' },
  )
  assert.deepEqual(resolveAvatar({ photoUrl: '', style: 'female' }), { kind: 'illustration', style: 'female' })
  assert.deepEqual(resolveAvatar({ photoUrl: null, style: 'female' }), { kind: 'illustration', style: 'female' })
  assert.deepEqual(resolveAvatar({ style: 'nope' }), { kind: 'illustration', style: 'male' })
  assert.deepEqual(resolveAvatar({}), { kind: 'illustration', style: 'male' })
  assert.equal(normalizeAvatarStyle('female'), 'female')
  assert.equal(normalizeAvatarStyle(undefined), 'male')
})

test('picker save writes male or female and refuses anything else', () => {
  assert.deepEqual(avatarStylePatch('female'), { avatar_style: 'female' })
  assert.deepEqual(avatarStylePatch('male'), { avatar_style: 'male' })
  assert.equal(avatarStylePatch('other'), null)
  assert.equal(avatarStylePatch(null), null)
  assert.equal(avatarStylePatch(' Female '), null)
  const saved: Array<{ avatar_style: string }> = []
  assert.equal(
    commitAvatarStyle('female', (patch) => {
      saved.push(patch)
    }),
    true,
  )
  assert.deepEqual(saved, [{ avatar_style: 'female' }])
  assert.equal(commitAvatarStyle('group', () => saved.push({ avatar_style: 'nope' })), false)
  assert.deepEqual(saved, [{ avatar_style: 'female' }])
})

test('picker shows both illustrations under the default picture label', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const ui = await vite.ssrLoadModule('/src/components/DefaultPicturePicker.tsx')
    const avatar = await vite.ssrLoadModule('/src/components/Avatar.tsx')
    const picker = renderToStaticMarkup(
      createElement(ui.DefaultPicturePicker, {
        value: 'female',
        onSave: () => {},
      }),
    )
    assert.match(picker, new RegExp(DEFAULT_PICTURE_LABEL))
    assert.match(picker, /data-avatar-choice="male"/)
    assert.match(picker, /data-avatar-choice="female"/)
    assert.match(picker, /aria-checked="true"/)
    assert.match(picker, /src="\/avatars\/female\.svg"/)
    assert.match(picker, /src="\/avatars\/male\.svg"/)
    assert.equal(picker.includes('\u2014'), false)
    assert.equal(picker.includes('\u2013'), false)

    const photo = renderToStaticMarkup(
      createElement(avatar.Avatar, {
        src: 'https://example.com/photo.jpg',
        avatarStyle: 'female',
        size: 40,
        alt: 'Member',
      }),
    )
    assert.match(photo, /data-avatar="photo"/)
    assert.equal(photo.includes('data-avatar-style'), false)
    const busy = renderToStaticMarkup(
      createElement(avatar.Avatar, { src: 'https://example.com/photo.jpg', avatarStyle: 'female', size: 36, busy: true, alt: '' }),
    )
    assert.match(busy, /Loading photo/)
    assert.equal(busy.includes('<img'), false)
    assert.equal(busy.includes('QM'), false)
  } finally {
    await vite.close()
  }
})

test('profile and people save the style, and letter initials are gone', () => {
  const profile = source('src/pages/dashboard/ProfilePage.tsx')
  const people = source('src/pages/admin/PeoplePage.tsx')
  const avatar = source('src/components/Avatar.tsx')
  assert.match(profile, /DefaultPicturePicker/)
  assert.match(profile, /\.update\(patch\)/)
  assert.match(profile, /Could not save the default picture\./)
  assert.match(people, /staffSetAvatarStyle/)
  assert.match(people, /DefaultPicturePicker/)
  assert.match(source('src/lib/supabase.ts'), /staff_set_avatar_style/)
  assert.equal(avatar.includes('initials'), false)
  assert.equal(source('src/pages/dashboard/AvatarCircle.tsx').includes('initials'), false)
  assert.equal(source('src/pages/dashboard/DirectoryBoard.tsx').includes('initials'), false)
  assert.equal(source('src/pages/dashboard/OwnAvatar.tsx').includes('initials'), false)
  assert.equal(source('src/lib/member.ts').includes('function initials'), false)
})

test('directory cards keep a photo path and a female style', () => {
  const card = presentDirectoryCard({
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Nora Al-Bayt',
    seat: 'ksa',
    avatar_style: 'female',
    avatar_path: '11111111-1111-4111-8111-111111111111/avatar',
  })
  assert.equal(card?.avatar_style, 'female')
  assert.equal(card?.avatar_path, '11111111-1111-4111-8111-111111111111/avatar')
  assert.equal(presentDirectoryCard({ id: 'x', full_name: 'Nora', seat: 'intl' })?.avatar_style, 'male')
})

test('migration grants avatar_style to authenticated and not anon', () => {
  const sql = source('supabase/migrations/20261028120000_profile_avatar_style.sql')
  assert.match(sql, /add column if not exists avatar_style text not null default 'male'/)
  assert.match(sql, /profiles_avatar_style_check/)
  assert.match(sql, /check \(avatar_style in \('male', 'female'\)\)/)
  assert.match(sql, /grant select \(avatar_style\) on table public\.profiles to authenticated/)
  assert.match(sql, /grant update \(avatar_style\) on table public\.profiles to authenticated/)
  assert.match(sql, /revoke select \(avatar_style\), update \(avatar_style\) on table public\.profiles from public, anon/)
  assert.equal(/grant\b[^\n;]*\bto\s+anon\b/i.test(sql), false)
  assert.equal(sql.includes('create policy profiles_update_own'), false)
  assert.match(sql, /staff_set_avatar_style/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  const emails = sql.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  for (const email of emails) assert.match(email, /@example\.com$/i)
})

test('illustrated avatars are committed svg with no external host', () => {
  for (const style of ['male', 'female'] as const) {
    const path = AVATAR_ILLUSTRATION[style]
    assert.equal(path.startsWith('/avatars/'), true)
    const file = `public${path}`
    assert.equal(existsSync(new URL(file, root)), true)
    const svg = source(file)
    assert.match(svg, /<svg/)
    assert.equal(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(svg), false)
    assert.equal(svg.includes('xlink:href'), false)
    assert.match(svg, /M74 102c4 4 8 4 12 0/)
  }
  assert.match(source('public/avatars/male.svg'), /#F7F4EE/)
  assert.match(source('public/avatars/female.svg'), /#1C1343/)
})
