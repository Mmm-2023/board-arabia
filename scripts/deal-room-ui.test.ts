import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  createRoomBody,
  filterInvitees,
  mandateOptions,
  opportunityOptions,
  pendingInvites,
  presentDirectoryInvitees,
  presentMyDealRooms,
  roomPowers,
  type DirectoryInvitee,
  type MemberDealRoom,
} from '../src/lib/dealRoomView.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OWNER = 'a1000001-0000-4000-8000-000000000001'
const GUEST = 'a1000001-0000-4000-8000-000000000002'
const SPONSOR = 'a1000001-0000-4000-8000-000000000009'
const ROOM = 'a3000001-0000-4000-8000-000000000010'
const MANDATE = 'a2000001-0000-4000-8000-000000000001'
const OPP = 'b1000001-0000-4000-8000-000000000001'
const HIDDEN = 'hidden-mailbox'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function page(node: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

function room(overrides: Partial<MemberDealRoom> = {}): MemberDealRoom {
  return {
    id: ROOM,
    name: 'North logistics room',
    purpose: 'A private room for a logistics mandate.',
    status: 'open',
    openedBy: 'member',
    ownerMemberId: OWNER,
    mandateId: MANDATE,
    reOpportunityId: null,
    createdAt: '2026-10-02T12:00:00.000Z',
    myRole: 'owner',
    myInviteStatus: 'accepted',
    participants: [
      { memberId: OWNER, role: 'owner', inviteStatus: 'accepted', fullName: 'Layla Al-Nadira' },
      { memberId: GUEST, role: 'member', inviteStatus: 'invited', fullName: 'Noura Al-Wahat' },
      { memberId: SPONSOR, role: 'member', inviteStatus: 'declined', fullName: 'Amal Al-Bayt' },
    ],
    ...overrides,
  }
}

test('presenters keep display fields and drop mailbox keys', () => {
  const rows = presentMyDealRooms([
    {
      id: ROOM,
      name: 'North logistics room',
      purpose: 'A private room for a logistics mandate.',
      status: 'open',
      opened_by: 'member',
      owner_member_id: OWNER,
      mandate_id: null,
      re_opportunity_id: null,
      created_at: '2026-10-02T12:00:00.000Z',
      my_role: 'invited',
      my_invite_status: 'accepted',
      invitee_email: HIDDEN,
      participants: [
        {
          member_id: OWNER,
          role: 'owner',
          invite_status: 'accepted',
          full_name: 'Layla Al-Nadira',
          contact_email: HIDDEN,
        },
      ],
    },
  ])
  assert.equal(rows.length, 0)

  const kept = presentMyDealRooms([
    {
      id: ROOM,
      name: 'North logistics room',
      purpose: 'A private room for a logistics mandate.',
      status: 'open',
      opened_by: 'member',
      owner_member_id: OWNER,
      mandate_id: MANDATE,
      re_opportunity_id: OPP,
      my_role: 'owner',
      my_invite_status: 'accepted',
      invitee_email: HIDDEN,
      participants: [
        {
          member_id: OWNER,
          role: 'owner',
          invite_status: 'accepted',
          full_name: 'Layla Al-Nadira',
          contact_email: HIDDEN,
        },
      ],
    },
  ])
  assert.equal(kept.length, 0)

  const one = presentMyDealRooms([
    {
      id: ROOM,
      name: 'North logistics room',
      purpose: 'A private room for a logistics mandate.',
      status: 'open',
      owner_member_id: OWNER,
      mandate_id: MANDATE,
      my_role: 'owner',
      my_invite_status: 'accepted',
      invitee_email: HIDDEN,
      participants: [
        {
          member_id: OWNER,
          role: 'owner',
          invite_status: 'accepted',
          full_name: 'Layla Al-Nadira',
          contact_email: HIDDEN,
        },
      ],
    },
  ])
  assert.equal(one.length, 1)
  assert.equal(JSON.stringify(one).includes(HIDDEN), false)
  assert.equal(one[0]?.participants[0]?.fullName, 'Layla Al-Nadira')
  assert.equal(one[0]?.mandateId, MANDATE)
  assert.equal(one[0]?.reOpportunityId, null)
})

test('directory search keeps active members and approved sponsors only', () => {
  const rows = presentDirectoryInvitees([
    { id: GUEST, full_name: 'Noura Al-Wahat', headline: 'Non-executive director', company: 'Wahat Counsel', seat: 'ksa', status: 'active' },
    { id: SPONSOR, full_name: 'Amal Al-Bayt', headline: 'Sponsor', company: 'Bayt Sponsor Desk', seat: 'sponsor', status: 'active' },
    { id: OWNER, full_name: 'Pending Person', headline: 'Director', company: 'Example Desk', seat: 'intl', status: 'invited' },
    { id: 'a1000001-0000-4000-8000-000000000008', full_name: 'Demo Person', headline: 'Director', company: 'Example Desk', seat: 'ksa', is_demo: true, status: 'active' },
    { id: 'not-a-person', full_name: 'Bad', seat: 'ksa', status: 'active' },
  ])
  assert.deepEqual(rows.map((row) => row.fullName), ['Noura Al-Wahat', 'Amal Al-Bayt'])
  const blocked = new Set([GUEST])
  const open: DirectoryInvitee[] = rows
  assert.deepEqual(
    filterInvitees(open, SPONSOR, blocked).map((row) => row.id),
    [],
  )
  assert.deepEqual(filterInvitees(open, OWNER, blocked).map((row) => row.fullName), ['Amal Al-Bayt'])
})

test('create allows one subject and rejects both', () => {
  const none = createRoomBody({ name: 'North logistics room', purpose: 'A private room.', mandateId: null, reOpportunityId: null })
  assert.equal(none.ok, true)
  if (none.ok) {
    assert.equal(none.body.mandate_id, null)
    assert.equal(none.body.re_opportunity_id, null)
  }
  const both = createRoomBody({
    name: 'North logistics room',
    purpose: 'A private room.',
    mandateId: MANDATE,
    reOpportunityId: OPP,
  })
  assert.equal(both.ok, false)
  const blank = createRoomBody({ name: '   ', purpose: 'A private room.', mandateId: null, reOpportunityId: null })
  assert.equal(blank.ok, false)
  const options = mandateOptions([
    { id: MANDATE, is_demo: false, sector: 'Logistics', one_liner: 'Growth capital for a Saudi freight platform.' },
    { id: OPP, is_demo: true, sector: 'Tourism', one_liner: 'Sample only.' },
  ])
  assert.equal(options.length, 1)
  assert.match(options[0]?.label || '', /Logistics/)
  assert.equal(
    opportunityOptions([{ id: OPP, is_demo: false, city: 'Jeddah', one_liner: 'A logistics yard.' }])[0]?.label,
    'Jeddah: A logistics yard.',
  )
})

test('pending invites and owner powers follow status', () => {
  const owner = room()
  const invitee = room({ myRole: 'member', myInviteStatus: 'invited', ownerMemberId: OWNER })
  assert.equal(pendingInvites([owner, invitee]).length, 1)
  assert.equal(pendingInvites([room({ status: 'archived', myRole: 'member', myInviteStatus: 'invited' })]).length, 0)
  assert.equal(roomPowers(owner).invite, true)
  assert.equal(roomPowers(owner).close, true)
  assert.equal(roomPowers(room({ status: 'closed' })).invite, false)
  assert.equal(roomPowers(room({ status: 'closed' })).rename, true)
  assert.equal(roomPowers(room({ status: 'archived' })).archive, false)
  assert.equal(roomPowers(invitee).accept, true)
  assert.equal(roomPowers(invitee).rename, false)
})

test('screens show create, invite, accept, manage, and staff close', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const createForm = (await vite.ssrLoadModule('/src/pages/dashboard/CreateRoomForm.tsx')) as {
      CreateRoomForm: (props: Record<string, unknown>) => ReactNode
    }
    const panelMod = (await vite.ssrLoadModule('/src/pages/dashboard/DealRoomPanel.tsx')) as {
      DealRoomPanel: (props: Record<string, unknown>) => ReactNode
    }
    const cardsMod = (await vite.ssrLoadModule('/src/pages/dashboard/PendingInviteCards.tsx')) as {
      PendingInviteCards: (props: Record<string, unknown>) => ReactNode
    }
    const staffMod = (await vite.ssrLoadModule('/src/pages/admin/StaffRoomsBoard.tsx')) as {
      StaffRoomsBoard: (props: Record<string, unknown>) => ReactNode
    }
    const html = page(
      createElement(createForm.CreateRoomForm, {
      name: 'North logistics room',
      purpose: 'A private room for a logistics mandate.',
      subjectKind: 'mandate',
      mandateId: MANDATE,
      reOpportunityId: '',
      mandates: [{ id: MANDATE, label: 'Logistics: Growth capital for a Saudi freight platform.' }],
      opportunities: [{ id: OPP, label: 'Jeddah: A logistics yard.' }],
      mandatesNote: null,
      opportunitiesNote: null,
      busy: false,
      error: '',
      onName: () => {},
      onPurpose: () => {},
      onSubjectKind: () => {},
      onMandateId: () => {},
      onReOpportunityId: () => {},
      onSubmit: () => {},
    }),
  )
  assert.match(html, /Room name \(required\)/)
  assert.match(html, /Purpose \(required\)/)
  assert.match(html, /Link \(optional\)/)
  assert.match(html, /North logistics room/)
  assert.match(html, /Growth capital for a Saudi freight platform/)
    assert.equal(html.includes('Jeddah: A logistics yard.'), false)
    assert.equal(html.includes('\u2014'), false)

    const ownerHtml = page(
      createElement(panelMod.DealRoomPanel, {
      room: room(),
      mandates: [{ id: MANDATE, label: 'Logistics: Growth capital for a Saudi freight platform.' }],
      opportunities: [],
      inviteQuery: 'Al',
      invitees: [
        {
          id: 'a1000001-0000-4000-8000-000000000004',
          fullName: 'Hanan Al-Safi',
          headline: 'Family principal',
          company: 'Safi House',
          seat: 'ksa',
        },
      ],
      inviteStatus: 'ready',
      inviteMessage: '',
      actionError: '',
      busy: false,
      onRename: () => {},
      onSearch: () => {},
      onInvite: () => {},
      onRemove: () => {},
      onClose: () => {},
      onArchive: () => {},
      onAccept: () => {},
      onDecline: () => {},
    }),
  )
  assert.match(ownerHtml, /Rename/)
  assert.match(ownerHtml, /Search directory/)
  assert.match(ownerHtml, /Hanan Al-Safi/)
  assert.match(ownerHtml, /Invite/)
  assert.match(ownerHtml, /Close room/)
  assert.match(ownerHtml, /Archive room/)
  assert.match(ownerHtml, /Remove/)
  assert.match(ownerHtml, /Declined/)
    assert.equal(ownerHtml.includes('>Accept<'), false)

    const guest = room({ myRole: 'member', myInviteStatus: 'accepted' })
    const guestHtml = page(panel(panelMod.DealRoomPanel, guest))
    assert.equal(guestHtml.includes('Rename'), false)
    assert.equal(guestHtml.includes('Search directory'), false)
    assert.equal(guestHtml.includes('Close room'), false)
    assert.equal(guestHtml.includes('Archive room'), false)
    assert.equal(guestHtml.includes('Remove'), false)
    assert.match(guestHtml, /Only the owner can change it/)

    const inviteeHtml = page(panel(panelMod.DealRoomPanel, room({ myRole: 'member', myInviteStatus: 'invited' })))
    assert.match(inviteeHtml, />Accept</)
    assert.match(inviteeHtml, />Decline</)
    assert.equal(inviteeHtml.includes('Rename'), false)

    const home = page(
      createElement(cardsMod.PendingInviteCards, {
      invites: [room({ myRole: 'member', myInviteStatus: 'invited' })],
      busyId: null,
      errors: {},
      onAccept: () => {},
      onDecline: () => {},
    }),
  )
    assert.match(home, /data-deal-accept/)
    assert.match(home, /North logistics room/)
    assert.match(home, /Invited by Layla Al-Nadira/)
    assert.match(home, />Accept</)
    assert.match(home, />Decline</)

    const staff = page(
      createElement(staffMod.StaffRoomsBoard, {
      rooms: [
        {
          id: ROOM,
          name: 'North logistics room',
          purpose: 'A private room for a logistics mandate.',
          status: 'open',
          openedBy: 'member',
          acceptedCount: 1,
          invitedCount: 1,
        },
        {
          id: 'a3000001-0000-4000-8000-000000000011',
          name: 'Industrial services room',
          purpose: 'Opened by admin.',
          status: 'closed',
          openedBy: 'admin',
          acceptedCount: 0,
          invitedCount: 0,
        },
      ],
      busyId: null,
      error: '',
      onClose: () => {},
    }),
  )
    assert.equal((staff.match(/Close room/g) || []).length, 1)
    assert.match(staff, /Opened by the desk/)
    assert.match(staff, /Opened by a member/)
    assert.match(staff, /Industrial services room/)
  } finally {
    await vite.close()
  }
})

test('the client uses Edge functions and read RPCs, not raw room tables', () => {
  const files = [
    'src/lib/dealRoomApi.ts',
    'src/pages/dashboard/RoomsPage.tsx',
    'src/pages/dashboard/DealRoomsView.tsx',
    'src/pages/dashboard/CreateRoomPage.tsx',
    'src/pages/dashboard/DealRoomPage.tsx',
    'src/pages/dashboard/DashboardHome.tsx',
    'src/pages/admin/StaffRoomsPage.tsx',
  ]
  for (const file of files) {
    const text = source(file)
    assert.equal(/\.from\(['"](?:rooms|room_participants|members)['"]\)/.test(text), false, file)
    assert.equal(text.includes('\u2014'), false, file)
  }
  const api = source('src/lib/dealRoomApi.ts')
  for (const name of ['deal-room-create', 'deal-room-invite', 'deal-room-respond', 'deal-room-manage', 'deal-room-staff']) {
    assert.match(api, new RegExp(name))
  }
  assert.match(api, /list_my_deal_rooms/)
  assert.match(api, /search_deal_room_directory/)
  assert.match(source('src/pages/dashboard/RoomsPage.tsx'), /fetchRooms\(/)
  assert.match(source('src/pages/dashboard/RoomsBoard.tsx'), /Deal rooms opened by the desk\./)
  assert.match(source('src/pages/dashboard/RoomsBoard.tsx'), /Cards marked Example are samples\./)
  const board = source('src/pages/dashboard/RoomsBoard.tsx')
  assert.match(board, /room\.member_count/)
  assert.match(board, /Host \$\{room\.host_name\}/)
})

test('the read migration sorts after 20261004120000 and returns no mailbox', () => {
  const file = '20261007120000_member_deal_room_reads.sql'
  const name = `supabase/migrations/${file}`
  const sql = source(name)
  assert.ok(file > '20261006120000')
  assert.ok(file > '20261004120000')
  assert.ok(file > '20261003120000_re_regulatory_readiness.sql')
  assert.ok(file > '20261002120000_member_deal_rooms.sql')
  assert.match(sql, /opened_by = 'member'/)
  assert.match(sql, /m\.status = 'active'/)
  assert.match(sql, /m\.seat in \('ksa', 'intl', 'sponsor'\)/)
  assert.match(sql, /grant execute on function public\.list_my_deal_rooms\(\) to authenticated/)
  assert.match(sql, /grant execute on function public\.search_deal_room_directory\(text\) to authenticated/)
  assert.match(sql, /revoke all on function public\.list_my_deal_rooms\(\) from public, anon/)
  assert.equal(/email/i.test(sql), false)
  assert.equal(sql.includes('@'), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('service_role'), false)
})

test('staff list is on the staff route and not a sixth primary tab', () => {
  const app = source('src/App.tsx')
  assert.match(app, /path="rooms" element=\{<StaffRoomsPage/)
  assert.match(app, /path="rooms\/new"/)
  assert.match(app, /path="rooms\/:roomId"/)
  const destinations = source('src/shell/destinations.ts')
  assert.match(destinations, /id: 'rooms', label: 'Rooms', to: '\/admin\/rooms'/)
  const staffPrimaries = destinations.slice(
    destinations.indexOf('export const STAFF_DESTINATIONS'),
    destinations.indexOf('export const MEMBER_SECONDARY'),
  )
  assert.equal(staffPrimaries.includes("label: 'Rooms'"), false)
})

function panel(View: (props: Record<string, unknown>) => ReactNode, value: MemberDealRoom) {
  return createElement(View, {
    room: value,
    mandates: [],
    opportunities: [],
    inviteQuery: '',
    invitees: [],
    inviteStatus: 'idle',
    inviteMessage: '',
    actionError: '',
    busy: false,
    onRename: () => {},
    onSearch: () => {},
    onInvite: () => {},
    onRemove: () => {},
    onClose: () => {},
    onArchive: () => {},
    onAccept: () => {},
    onDecline: () => {},
  })
}
