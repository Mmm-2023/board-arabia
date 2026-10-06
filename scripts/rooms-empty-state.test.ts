import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { dealsNavCount, presentMyDealRooms, type MemberDealRoom } from '../src/lib/dealRoomView.ts'
import type { RoomCard } from '../src/lib/demoRows.ts'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OWNER = 'a1000001-0000-4000-8000-000000000001'
const ROOM = 'a3000001-0000-4000-8000-000000000010'
const EXAMPLE = 'a3000001-0000-4000-8000-000000000001'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function page(node: ReactNode) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

function ownRoom(): MemberDealRoom {
  return {
    id: ROOM,
    name: 'North logistics room',
    purpose: 'A private room for a logistics mandate.',
    status: 'open',
    openedBy: 'member',
    ownerMemberId: OWNER,
    mandateId: null,
    reOpportunityId: null,
    createdAt: '2026-10-02T12:00:00.000Z',
    myRole: 'owner',
    myInviteStatus: 'accepted',
    participants: [
      { memberId: OWNER, role: 'owner', inviteStatus: 'accepted', fullName: 'Layla Al-Nadira' },
    ],
  }
}

function exampleRoom(): RoomCard {
  return {
    id: EXAMPLE,
    is_demo: true,
    name: 'Industrial services room',
    summary: 'A working room for a growth brief in industrial services. Opened by admin.',
    sector: 'Energy transition',
    stage: 'Diligence',
    member_count: 4,
    host_name: 'Layla Al-Nadira',
  }
}

test('empty room copy is one plain line and the button is Open a room', () => {
  const line = MEMBER_VIEWS.rooms.empty
  assert.equal(line.includes('\n'), false)
  assert.equal(line.includes('\u2014'), false)
  assert.equal(line.includes('\u2013'), false)
  assert.match(line, /Open a private room for a deal, link a mandate or an opportunity, and invite chosen members/)
  assert.equal(/document|terms|messag/i.test(line), false)
  assert.equal(MEMBER_VIEWS.rooms.openRoom, 'Open a room')
  assert.equal(MEMBER_VIEWS.rooms.emptyCta, 'Create room')
})

test('example rooms do not count on the deals nav badge', () => {
  const examples = presentMyDealRooms([
    {
      id: EXAMPLE,
      name: 'Industrial services room',
      purpose: 'Opened by admin.',
      status: 'open',
      opened_by: 'admin',
      is_demo: true,
      owner_member_id: OWNER,
      my_role: 'member',
      my_invite_status: 'invited',
      participants: [],
    },
    {
      id: 'a3000001-0000-4000-8000-000000000099',
      name: 'Sample member room',
      purpose: 'A sample only.',
      status: 'open',
      opened_by: 'member',
      is_demo: true,
      owner_member_id: OWNER,
      my_role: 'member',
      my_invite_status: 'invited',
      participants: [],
    },
  ])
  assert.equal(examples.length, 0)
  assert.equal(dealsNavCount(examples), 0)
  assert.equal(dealsNavCount([]), 0)

  const accepted = presentMyDealRooms([
    {
      id: ROOM,
      name: 'North logistics room',
      purpose: 'A private room.',
      status: 'open',
      opened_by: 'member',
      is_demo: false,
      owner_member_id: OWNER,
      my_role: 'owner',
      my_invite_status: 'accepted',
      participants: [],
    },
  ])
  assert.equal(accepted.length, 1)
  assert.equal(dealsNavCount(accepted), 0)

  const waiting = presentMyDealRooms([
    {
      id: ROOM,
      name: 'North logistics room',
      purpose: 'A private room.',
      status: 'open',
      opened_by: 'member',
      is_demo: false,
      owner_member_id: OWNER,
      my_role: 'member',
      my_invite_status: 'invited',
      participants: [],
    },
  ])
  assert.equal(dealsNavCount(waiting), 1)

  const layout = source('src/pages/dashboard/DashboardLayout.tsx')
  assert.match(layout, /dealsNavCount\(result\.rows\)/)
  assert.equal(layout.includes('fetchRooms'), false)
  assert.equal(layout.includes('list_member_rooms'), false)
})

test('your rooms empty state shows for zero rooms and hides when they have one', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = (await vite.ssrLoadModule('/src/pages/dashboard/DealRoomsView.tsx')) as {
      OPEN_ROOM_PATH: string
      YourRooms: (props: { rooms: MemberDealRoom[] }) => ReactNode
      DealRoomsView: (props: { showCreate: boolean; yours: ReactNode; openedByAdmin: ReactNode }) => ReactNode
    }
    const board = (await vite.ssrLoadModule('/src/pages/dashboard/RoomsBoard.tsx')) as {
      RoomsBoard: (props: { rooms: RoomCard[]; embedded?: boolean }) => ReactNode
    }
    assert.equal(view.OPEN_ROOM_PATH, '/dashboard/deals/rooms/new')
    assert.match(source('src/App.tsx'), /path="rooms\/new" element=\{<CreateRoomPage/)

    const empty = page(createElement(view.YourRooms, { rooms: [] }))
    assert.match(empty, /data-rooms-empty="true"/)
    assert.match(empty, /Open a private room for a deal, link a mandate or an opportunity, and invite chosen members\./)
    assert.equal(/document|terms|messag/i.test(empty), false)
    assert.match(empty, />Open a room</)
    assert.match(empty, /href="\/dashboard\/deals\/rooms\/new"/)
    assert.equal(empty.includes('\u2014'), false)
    assert.equal(empty.includes('\u2013'), false)

    const filled = page(createElement(view.YourRooms, { rooms: [ownRoom()] }))
    assert.match(filled, /data-rooms-empty="false"/)
    assert.equal(filled.includes('data-rooms-empty="true"'), false)
    assert.equal(filled.includes('Open a private room for a deal'), false)
    assert.equal(filled.includes('Open a room'), false)
    assert.equal(filled.includes('href="/dashboard/deals/rooms/new"'), false)
    assert.match(filled, /North logistics room/)
    assert.match(filled, new RegExp(`href="/dashboard/deals/rooms/${ROOM}"`))

    const listed = page(
      createElement(view.DealRoomsView, {
        showCreate: false,
        yours: createElement(view.YourRooms, { rooms: [] }),
        openedByAdmin: createElement(board.RoomsBoard, { rooms: [exampleRoom()], embedded: true }),
      }),
    )
    assert.match(listed, /aria-label="Your rooms"/)
    assert.match(listed, /data-rooms-empty="true"/)
    assert.match(listed, /href="\/dashboard\/deals\/rooms\/new"/)
    assert.equal((listed.match(/href="\/dashboard\/deals\/rooms\/new"/g) || []).length, 1)
    assert.match(listed, /aria-label="Opened by our admin team"/)
    assert.match(listed, />Example</)
    assert.match(listed, /Industrial services room/)
    assert.match(listed, /Cards marked Example are samples\./)
    assert.match(listed, /data-sample-action="inert"/)
    assert.match(listed, />Sample</)
    assert.match(listed, />Open room</)
    assert.match(listed, /<button[^>]*disabled=""[^>]*>Open room<\/button>/)
    assert.equal(listed.includes('>Create room<'), false)

    const withOwn = page(
      createElement(view.DealRoomsView, {
        showCreate: true,
        yours: createElement(view.YourRooms, { rooms: [ownRoom()] }),
        openedByAdmin: createElement(board.RoomsBoard, { rooms: [exampleRoom()], embedded: true }),
      }),
    )
    assert.match(withOwn, /data-rooms-empty="false"/)
    assert.equal(withOwn.includes('Open a private room for a deal'), false)
    assert.match(withOwn, /North logistics room/)
    assert.match(withOwn, />Create room</)
    assert.match(withOwn, /Industrial services room/)
    assert.match(withOwn, />Example</)
  } finally {
    await vite.close()
  }
})
