import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { postLoginDestination } from '../supabase/functions/_shared/staff_auth.ts'
import { MEMBER_LOGIN } from '../src/content/marketing.ts'
import { isStaffReturn, loginHref, safeReturnPath } from '../src/lib/returnPath.ts'

test('member sign-in keeps the full destination and staff sign-in is its own path', () => {
  assert.equal(MEMBER_LOGIN, '/login')
  const room = '/dashboard/deals/rooms/room-1?tab=files#notes'
  const href = loginHref(room)
  const next = new URL(`https://boardarabia.com${href}`).searchParams.get('next')
  assert.equal(href.startsWith('/login?next='), true)
  assert.equal(href.includes('/login/staff'), false)
  assert.equal(next, room)
  assert.equal(safeReturnPath(next, '/dashboard'), room)
  assert.equal(isStaffReturn(room), false)
  assert.equal(
    postLoginDestination({ role: null, memberStatus: 'active', requested: next }),
    room,
  )

  const admin = loginHref('/admin/people?status=open', true)
  const adminNext = new URL(`https://boardarabia.com${admin}`).searchParams.get('next')
  assert.equal(admin.startsWith('/login/staff?next='), true)
  assert.equal(adminNext, '/admin/people?status=open')
  assert.equal(isStaffReturn(adminNext || ''), true)
  assert.equal(
    postLoginDestination({ role: 'staff', memberStatus: null, requested: adminNext }),
    '/admin/people?status=open',
  )
})

test('return paths reject open redirects and login loops', () => {
  assert.equal(safeReturnPath(null, '/dashboard'), '/dashboard')
  assert.equal(safeReturnPath('https://evil.example/phish', '/dashboard'), '/dashboard')
  assert.equal(safeReturnPath('//evil.example', '/admin'), '/admin')
  assert.equal(safeReturnPath('/\\evil.example', '/dashboard'), '/dashboard')
  assert.equal(safeReturnPath('/login/staff', '/dashboard'), '/dashboard')
  assert.equal(safeReturnPath('/auth/confirm', '/admin'), '/admin')
  assert.equal(safeReturnPath('/dashboard/../admin', '/dashboard'), '/dashboard')
  assert.equal(loginHref('https://evil.example'), '/login?next=' + encodeURIComponent('/dashboard'))
  assert.equal(isStaffReturn('/dashboard'), false)
  assert.equal(isStaffReturn('/admin?tab=1'), true)
  assert.equal(isStaffReturn('/ops/legacy'), true)
})

test('login copy is the member door and does not name the auth vendor', () => {
  const login = readFileSync(new URL('../src/pages/LoginPage.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../src/pages/dashboard/DashboardLayout.tsx', import.meta.url), 'utf8')
  const admin = readFileSync(new URL('../src/pages/admin/AdminLayout.tsx', import.meta.url), 'utf8')
  const invite = readFileSync(new URL('../supabase/functions/invite-master/index.ts', import.meta.url), 'utf8')
  assert.equal(login.includes('Supabase'), false)
  assert.equal(login.includes('Staff only'), false)
  assert.equal(login.includes('STAFF ONLY'), false)
  assert.match(login, /Staff sign in/)
  assert.match(login, /Member sign in/)
  assert.match(login, /to="\/login\/staff"/)
  assert.match(app, /path="\/login\/staff"/)
  assert.match(layout, /loginHref\(currentReturnPath\(location\)\)/)
  assert.equal(layout.includes('"/login?next=/dashboard"'), false)
  assert.match(admin, /loginHref\(currentReturnPath\(location\), true\)/)
  assert.match(invite, /\/login\/staff/)
  assert.equal(login.includes('\u2014'), false)
  assert.equal(login.includes('\u2013'), false)
})
