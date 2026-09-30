import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  AVATAR_ILLUSTRATION,
  AVATAR_STYLES,
  AVATAR_STYLE_LABEL,
  DEFAULT_PICTURE_LABEL,
  LEGACY_AVATAR_STYLE,
  avatarSrcSet,
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

test('avatar fallback prefers a photo, then the chosen illustration, then man-shemagh', () => {
  assert.deepEqual(resolveAvatar({ photoUrl: 'https://example.com/photo.jpg', style: 'woman-hijab-black' }), {
    kind: 'photo',
    src: 'https://example.com/photo.jpg',
  })
  assert.deepEqual(resolveAvatar({ photoUrl: '  https://example.com/photo.jpg  ', style: 'man-shemagh' }), {
    kind: 'photo',
    src: 'https://example.com/photo.jpg',
  })
  assert.deepEqual(
    resolveAvatar({ photoUrl: 'https://example.com/photo.jpg', photoFailed: true, style: 'female' }),
    { kind: 'illustration', style: 'woman-hijab-black' },
  )
  assert.deepEqual(resolveAvatar({ photoUrl: '', style: 'man-ghutra' }), { kind: 'illustration', style: 'man-ghutra' })
  assert.deepEqual(resolveAvatar({ photoUrl: null, style: 'female' }), {
    kind: 'illustration',
    style: 'woman-hijab-black',
  })
  assert.deepEqual(resolveAvatar({ style: 'nope' }), { kind: 'illustration', style: 'man-shemagh' })
  assert.deepEqual(resolveAvatar({}), { kind: 'illustration', style: 'man-shemagh' })
  assert.equal(normalizeAvatarStyle('female'), 'woman-hijab-black')
  assert.equal(normalizeAvatarStyle('male'), 'man-shemagh')
  assert.equal(normalizeAvatarStyle(undefined), 'man-shemagh')
})

test('key mapping sends legacy male and female to shemagh and black hijab', () => {
  assert.equal(LEGACY_AVATAR_STYLE.male, 'man-shemagh')
  assert.equal(LEGACY_AVATAR_STYLE.female, 'woman-hijab-black')
  for (const style of AVATAR_STYLES) {
    assert.equal(normalizeAvatarStyle(style), style)
    assert.deepEqual(resolveAvatar({ style }), { kind: 'illustration', style })
  }
  assert.equal(normalizeAvatarStyle('male'), 'man-shemagh')
  assert.equal(normalizeAvatarStyle('female'), 'woman-hijab-black')
  assert.equal(normalizeAvatarStyle(' Male '), 'man-shemagh')
  assert.equal(normalizeAvatarStyle('group'), 'man-shemagh')
})

test('picker save writes one of the eight keys and refuses legacy or unknown values', () => {
  assert.deepEqual(avatarStylePatch('woman-hijab-black'), { avatar_style: 'woman-hijab-black' })
  assert.deepEqual(avatarStylePatch('man-shemagh'), { avatar_style: 'man-shemagh' })
  assert.deepEqual(avatarStylePatch('man-suit'), { avatar_style: 'man-suit' })
  assert.equal(avatarStylePatch('male'), null)
  assert.equal(avatarStylePatch('female'), null)
  assert.equal(avatarStylePatch('other'), null)
  assert.equal(avatarStylePatch(null), null)
  assert.equal(avatarStylePatch(' Female '), null)
  const saved: Array<{ avatar_style: string }> = []
  assert.equal(
    commitAvatarStyle('woman-shayla', (patch) => {
      saved.push(patch)
    }),
    true,
  )
  assert.deepEqual(saved, [{ avatar_style: 'woman-shayla' }])
  assert.equal(commitAvatarStyle('female', () => saved.push({ avatar_style: 'nope' })), false)
  assert.equal(commitAvatarStyle('group', () => saved.push({ avatar_style: 'nope' })), false)
  assert.deepEqual(saved, [{ avatar_style: 'woman-shayla' }])
})

test('picker shows eight thumbnails and maps a legacy value onto the matching picture', async () => {
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
    assert.match(picker, /grid-cols-4/)
    assert.match(picker, /size-11/)
    assert.equal(picker.includes('flex-wrap'), false)
    for (const style of AVATAR_STYLES) {
      assert.match(picker, new RegExp(`data-avatar-choice="${style}"`))
      assert.match(picker, new RegExp(`aria-label="${AVATAR_STYLE_LABEL[style]}"`))
      assert.match(picker, new RegExp(avatarSrcSet(style, 'webp').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    const selectedAt = picker.indexOf('data-avatar-choice="woman-hijab-black"')
    const selected = picker.slice(picker.lastIndexOf('<button', selectedAt), picker.indexOf('</button>', selectedAt))
    assert.match(selected, /aria-checked="true"/)
    assert.match(selected, /aria-label="Woman in a black hijab"/)
    assert.equal((picker.match(/aria-checked="true"/g) ?? []).length, 1)
    assert.equal(picker.includes('\u2014'), false)
    assert.equal(picker.includes('\u2013'), false)

    const photo = renderToStaticMarkup(
      createElement(avatar.Avatar, {
        src: 'https://example.com/photo.jpg',
        avatarStyle: 'woman-hijab-navy',
        size: 40,
        alt: 'Member',
      }),
    )
    assert.match(photo, /data-avatar="photo"/)
    assert.equal(photo.includes('data-avatar-style'), false)
    const busy = renderToStaticMarkup(
      createElement(avatar.Avatar, {
        src: 'https://example.com/photo.jpg',
        avatarStyle: 'female',
        size: 36,
        busy: true,
        alt: '',
      }),
    )
    assert.match(busy, /Loading photo/)
    assert.equal(busy.includes('<img'), false)
    assert.equal(busy.includes('QM'), false)

    const art = renderToStaticMarkup(
      createElement(avatar.Avatar, { src: null, avatarStyle: 'male', size: 48, alt: '' }),
    )
    assert.match(art, /data-avatar="illustration"/)
    assert.match(art, /data-avatar-style="man-shemagh"/)
    assert.match(art, /clip-path:circle\(50%\)/)
    assert.match(art, /rounded-full/)
    assert.match(art, /overflow-hidden/)
  } finally {
    await vite.close()
  }
})

test('profile and people save the style, and letter initials are gone', () => {
  const profile = source('src/pages/dashboard/ProfilePage.tsx')
  const people = source('src/pages/admin/PeoplePage.tsx')
  const avatar = source('src/components/Avatar.tsx')
  assert.match(profile, /DefaultPicturePicker/)
  assert.match(profile, /DEFAULT_PICTURE_NOTE/)
  assert.match(source('src/lib/avatarStyle.ts'), /An uploaded photo is shown instead of this picture\./)
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

test('directory cards keep a photo path and map a legacy female style', () => {
  const card = presentDirectoryCard({
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Nora Al-Bayt',
    seat: 'ksa',
    avatar_style: 'female',
    avatar_path: '11111111-1111-4111-8111-111111111111/avatar',
  })
  assert.equal(card?.avatar_style, 'woman-hijab-black')
  assert.equal(card?.avatar_path, '11111111-1111-4111-8111-111111111111/avatar')
  assert.equal(presentDirectoryCard({ id: 'x', full_name: 'Nora', seat: 'intl' })?.avatar_style, 'man-shemagh')
  assert.equal(
    presentDirectoryCard({ id: 'x', full_name: 'Nora', seat: 'intl', avatar_style: 'man-suit-beard' })?.avatar_style,
    'man-suit-beard',
  )
  assert.equal(
    presentDirectoryCard({ id: 'x', full_name: 'Nora', seat: 'intl', avatar_style: 'male' })?.avatar_style,
    'man-shemagh',
  )
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

test('legacy backfill and staff RPC accept only the eight keys', () => {
  const sql = source('supabase/migrations/20261112120000_avatar_style_eight.sql')
  assert.match(sql, /drop constraint if exists profiles_avatar_style_check/)
  assert.match(sql, /set avatar_style = 'man-shemagh'\s+where avatar_style = 'male'/)
  assert.match(sql, /set avatar_style = 'woman-hijab-black'\s+where avatar_style = 'female'/)
  assert.match(sql, /alter column avatar_style set default 'man-shemagh'/)
  for (const style of AVATAR_STYLES) {
    assert.equal(sql.includes(`'${style}'`), true, style)
  }
  const fnStart = sql.indexOf('function public.staff_set_avatar_style')
  const fn = sql.slice(fnStart, sql.indexOf('$$;', fnStart))
  assert.match(fn, /if not private\.is_staff\(\)/)
  assert.match(fn, /set search_path = public/)
  assert.match(fn, /invalid_style/)
  const allowed = fn.slice(fn.indexOf('not in'), fn.indexOf('then', fn.indexOf('not in')))
  for (const style of AVATAR_STYLES) assert.match(allowed, new RegExp(`'${style}'`))
  assert.equal(allowed.includes("'male'"), false)
  assert.equal(allowed.includes("'female'"), false)
  const staffAt = fn.indexOf('if not private.is_staff()')
  const updateAt = fn.search(/\bupdate\b/i)
  assert.ok(staffAt >= 0 && updateAt > staffAt)
  assert.match(sql, /revoke all on function public\.staff_set_avatar_style\(uuid, text\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_set_avatar_style\(uuid, text\) to authenticated;/)
  assert.equal(/grant\b[^\n;]*\bto\s+anon\b/i.test(sql), false)
  assert.equal(/create\s+(or\s+replace\s+)?(materialized\s+)?view\b/i.test(sql), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  const emails = sql.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  assert.deepEqual(emails, [])
})

test('illustrated avatars are committed webp and avif with no external host', () => {
  for (const style of AVATAR_STYLES) {
    const path = AVATAR_ILLUSTRATION[style]
    assert.equal(path, `/avatars/${style}-256.webp`)
    for (const file of [
      `assets/avatars/${style}.png`,
      `public/avatars/${style}-96.webp`,
      `public/avatars/${style}-256.webp`,
      `public/avatars/${style}-96.avif`,
      `public/avatars/${style}-256.avif`,
    ]) {
      const url = new URL(file, root)
      assert.equal(existsSync(url), true, file)
      const bytes = readFileSync(url)
      assert.ok(bytes.length > 400, file)
      if (file.endsWith('.webp')) {
        assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file)
        assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file)
      }
      if (file.endsWith('.avif')) assert.equal(bytes.toString('ascii', 4, 8), 'ftyp', file)
      if (file.endsWith('.png')) assert.equal(bytes.toString('ascii', 1, 4), 'PNG', file)
      assert.equal(bytes.includes(Buffer.from('https://')), false, file)
    }
  }
  assert.equal(existsSync(new URL('public/avatars/sheet.png', root)), false)
  assert.equal(existsSync(new URL('public/avatars/reference-8.jpg', root)), false)
  assert.equal(existsSync(new URL(`public/avatars/${AVATAR_STYLES[0]}.png`, root)), false)
  const avatar = source('src/components/Avatar.tsx')
  const styles = source('src/lib/avatarStyle.ts')
  assert.equal(avatar.includes('.png'), false)
  assert.equal(styles.includes('.png'), false)
  assert.match(avatar, /image\/avif/)
  assert.match(avatar, /image\/webp/)
})
