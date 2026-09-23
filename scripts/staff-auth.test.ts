import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  clientAdminGate,
  isStaffRole,
  memberRoomLabel,
  postLoginDestination,
  showRoleSwitch,
  staffApiDecision,
} from '../supabase/functions/_shared/staff_auth.ts'

const MEMBER_ID = '487922db-3b6c-446b-9876-42194ffdaa60'

test('membership tiers are not staff roles', () => {
  for (const role of ['member', 'founding', 'sponsor', 'Founding Member', 'Sponsor', 'Member', null, '', 'admin']) {
    assert.equal(isStaffRole(role), false)
    assert.deepEqual(staffApiDecision({ userId: MEMBER_ID, role }), {
      allow: false,
      status: 403,
      error: 'Not staff',
    })
    assert.equal(clientAdminGate(true, role), 'dashboard')
    assert.deepEqual(showRoleSwitch(role, 'active'), { toAdmin: false, toMember: false })
  }
  assert.equal(isStaffRole('staff'), true)
  assert.equal(isStaffRole('master'), true)
})

test('missing user is 401 and a staff row is allowed', () => {
  assert.deepEqual(staffApiDecision({ userId: null, role: 'master' }), {
    allow: false,
    status: 401,
    error: 'Unauthorized',
  })
  assert.deepEqual(staffApiDecision({ userId: null, role: null }), {
    allow: false,
    status: 401,
    error: 'Unauthorized',
  })
  assert.deepEqual(staffApiDecision({ userId: 'staff-1', role: 'staff' }), {
    allow: true,
    role: 'staff',
  })
  assert.deepEqual(staffApiDecision({ userId: 'master-1', role: 'master' }), {
    allow: true,
    role: 'master',
  })
})

test('members-only login never opens admin, even when next is /admin', () => {
  const dest = postLoginDestination({
    role: null,
    memberStatus: 'active',
    requested: '/admin',
  })
  assert.equal(dest, '/dashboard')
  assert.equal(
    postLoginDestination({ role: 'member', memberStatus: 'active', requested: '/ops' }),
    '/dashboard',
  )
  assert.equal(
    postLoginDestination({ role: 'founding', memberStatus: 'active', requested: null }),
    '/dashboard',
  )
  assert.equal(
    postLoginDestination({
      role: null,
      memberStatus: 'active',
      requested: '/dashboard/invites',
    }),
    '/dashboard/invites',
  )
})

test('staff and master land on admin unless they also have a live member row and asked for the dashboard', () => {
  assert.equal(
    postLoginDestination({ role: 'master', memberStatus: 'active', requested: null }),
    '/admin',
  )
  assert.equal(
    postLoginDestination({ role: 'staff', memberStatus: null, requested: '/dashboard' }),
    '/admin',
  )
  assert.equal(
    postLoginDestination({ role: 'staff', memberStatus: 'suspended', requested: '/dashboard' }),
    '/admin',
  )
  assert.equal(
    postLoginDestination({ role: 'master', memberStatus: 'active', requested: '/dashboard' }),
    '/dashboard',
  )
  assert.equal(
    postLoginDestination({ role: 'staff', memberStatus: 'invited', requested: '/dashboard/profile' }),
    '/dashboard/profile',
  )
  assert.equal(clientAdminGate(false, 'master'), 'login')
  assert.equal(clientAdminGate(true, 'master'), 'allow')
  assert.equal(clientAdminGate(true, 'staff'), 'allow')
  assert.equal(clientAdminGate(true, null), 'dashboard')
})

test('role switcher requires both a staff role and a live member row', () => {
  assert.deepEqual(showRoleSwitch('master', 'active'), { toAdmin: true, toMember: true })
  assert.deepEqual(showRoleSwitch('staff', 'invited'), { toAdmin: true, toMember: true })
  assert.deepEqual(showRoleSwitch('staff', 'suspended'), { toAdmin: false, toMember: false })
  assert.deepEqual(showRoleSwitch('staff', null), { toAdmin: false, toMember: false })
  assert.deepEqual(showRoleSwitch(null, 'active'), { toAdmin: false, toMember: false })
  assert.deepEqual(showRoleSwitch('sponsor', 'active'), { toAdmin: false, toMember: false })
})

test('member room label follows the seat and does not say admin', () => {
  assert.equal(memberRoomLabel('ksa'), 'Founding member')
  assert.equal(memberRoomLabel('intl'), 'Founding member')
  assert.equal(memberRoomLabel(null), 'Member')
  assert.equal(memberRoomLabel('sponsor'), 'Member')
  for (const label of [memberRoomLabel('ksa'), memberRoomLabel('intl'), memberRoomLabel(null)]) {
    assert.equal(label.includes('\u2014'), false)
    assert.equal(/admin/i.test(label), false)
  }
})

test('admin Edge functions call requireStaff and do not trust metadata', () => {
  const adminFns = [
    'supabase/functions/decide-application/index.ts',
    'supabase/functions/admit-member/index.ts',
    'supabase/functions/invite-master/index.ts',
    'supabase/functions/set-member-status/index.ts',
    'supabase/functions/notify-application/index.ts',
    'supabase/functions/invite-sponsor/index.ts',
  ]
  const gate = readFileSync('supabase/functions/_shared/require_staff.ts', 'utf8')
  assert.match(gate, /auth\.getUser\(token\)/)
  assert.match(gate, /staffApiDecision/)
  assert.equal(/\.user_metadata|\.app_metadata/.test(gate), false)
  for (const file of adminFns) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /requireStaff\(/)
    assert.equal(/\.user_metadata|\.app_metadata|body\.role/.test(source), false)
  }
})

test('peer invite stays a member path and does not become a staff bypass', () => {
  const source = readFileSync('supabase/functions/send-member-invite/index.ts', 'utf8')
  assert.equal(source.includes('requireStaff'), false)
  assert.match(source, /from\('members'\)/)
  assert.equal(source.includes('user_metadata'), false)
  assert.equal(source.includes('body.role'), false)
})
