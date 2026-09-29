import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  DEAL_ROOM_FUNCTIONS,
  dealRoomInviteMail,
  dealRoomInviteSettled,
  decideDealRoom,
  deliverDealRoomInvite,
  isInvitableMember,
  missingDealRoomMailSecrets,
  participantState,
  sendDealRoomInvite,
  type DealAction,
  type DealActor,
  type DealRoomContext,
  type DealTarget,
  type MemberSeat,
  type MemberStatus,
  type ParticipantState,
} from '../supabase/functions/_shared/deal_room.ts'
import { handleDealRoom, publicPayload, type DealCaller, type DealEndpoint, type DealGate } from '../supabase/functions/_shared/deal_room_http.ts'
import { hasBoardFooter, hasSubstantiveBody } from '../supabase/functions/_shared/mail.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationName = '20261002120000_member_deal_rooms.sql'
const migrationPath = path.join(root, 'supabase/migrations', migrationName)
const migration = readFileSync(migrationPath, 'utf8')

const ROOM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INVITEE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ACCEPTED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OUTSIDER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const SPONSOR = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const STAFF = '99999999-9999-4999-8999-999999999999'
const DB_MAIL = 'person@example.com'

const openRoom: DealRoomContext = { status: 'open', openedBy: 'member' }

function person(
  userId: string | null,
  memberStatus: MemberStatus,
  seat: MemberSeat | null,
  staff: boolean,
  participant: ParticipantState,
): DealActor {
  return { userId, memberStatus, seat, staff, participant }
}

const actors = {
  anon: person(null, 'none', null, false, 'none'),
  outsider: person(OUTSIDER, 'active', 'ksa', false, 'none'),
  invitedMember: person(OUTSIDER, 'invited', 'intl', false, 'none'),
  suspended: person(OUTSIDER, 'suspended', 'ksa', false, 'none'),
  owner: person(OWNER, 'active', 'ksa', false, 'owner'),
  invitee: person(INVITEE, 'active', 'intl', false, 'invited'),
  accepted: person(ACCEPTED, 'active', 'ksa', false, 'accepted'),
  declined: person(ACCEPTED, 'active', 'ksa', false, 'declined'),
  removed: person(ACCEPTED, 'active', 'ksa', false, 'removed'),
  sponsor: person(SPONSOR, 'active', 'sponsor', false, 'none'),
  sponsorInvitee: person(SPONSOR, 'active', 'sponsor', false, 'invited'),
  pendingSponsor: person(SPONSOR, 'invited', 'sponsor', false, 'none'),
  staff: person(STAFF, 'none', null, true, 'none'),
  staffMember: person(STAFF, 'active', 'intl', true, 'none'),
}

const activeTarget: DealTarget = { userId: INVITEE, memberStatus: 'active', seat: 'intl' }
const sponsorTarget: DealTarget = { userId: SPONSOR, memberStatus: 'active', seat: 'sponsor' }
const pendingSponsorTarget: DealTarget = { userId: SPONSOR, memberStatus: 'invited', seat: 'sponsor' }
const suspendedTarget: DealTarget = { userId: INVITEE, memberStatus: 'suspended', seat: 'ksa' }

type MatrixCase = {
  name: string
  actor: DealActor
  action: DealAction
  allow: boolean
  status?: number
  room?: DealRoomContext | null
  target?: DealTarget | null
  targetParticipant?: ParticipantState
}

const matrix: MatrixCase[] = [
  { name: 'anon cannot create', actor: actors.anon, action: 'create', allow: false, status: 401 },
  { name: 'anon cannot read', actor: actors.anon, action: 'read', allow: false, status: 401 },
  { name: 'anon cannot invite', actor: actors.anon, action: 'invite', allow: false, status: 401, target: activeTarget },
  { name: 'anon cannot accept', actor: actors.anon, action: 'accept', allow: false, status: 401 },
  { name: 'anon cannot decline', actor: actors.anon, action: 'decline', allow: false, status: 401 },
  { name: 'anon cannot list', actor: actors.anon, action: 'list_all', allow: false, status: 401 },
  { name: 'anon cannot close as staff', actor: actors.anon, action: 'staff_close', allow: false, status: 401 },
  { name: 'outsider cannot read a room', actor: actors.outsider, action: 'read', allow: false, status: 403 },
  { name: 'outsider cannot invite', actor: actors.outsider, action: 'invite', allow: false, status: 403, target: activeTarget },
  { name: 'outsider cannot accept', actor: actors.outsider, action: 'accept', allow: false, status: 403 },
  { name: 'outsider cannot close', actor: actors.outsider, action: 'close', allow: false, status: 403 },
  { name: 'outsider cannot archive', actor: actors.outsider, action: 'archive', allow: false, status: 403 },
  { name: 'active outsider can create', actor: actors.outsider, action: 'create', allow: true },
  { name: 'invited member cannot create', actor: actors.invitedMember, action: 'create', allow: false, status: 403 },
  { name: 'suspended member cannot create', actor: actors.suspended, action: 'create', allow: false, status: 403 },
  { name: 'owner can read', actor: actors.owner, action: 'read', allow: true },
  { name: 'owner can invite an active member', actor: actors.owner, action: 'invite', allow: true, target: activeTarget },
  { name: 'owner can invite an approved sponsor', actor: actors.owner, action: 'invite', allow: true, target: sponsorTarget },
  { name: 'owner cannot invite a pending sponsor', actor: actors.owner, action: 'invite', allow: false, status: 403, target: pendingSponsorTarget },
  { name: 'owner cannot invite a suspended member', actor: actors.owner, action: 'invite', allow: false, status: 403, target: suspendedTarget },
  { name: 'owner cannot invite self', actor: actors.owner, action: 'invite', allow: false, status: 403, target: { userId: OWNER, memberStatus: 'active', seat: 'ksa' } },
  { name: 'owner can rename', actor: actors.owner, action: 'rename', allow: true },
  { name: 'owner can add', actor: actors.owner, action: 'add', allow: true, target: activeTarget },
  { name: 'owner can remove a participant', actor: actors.owner, action: 'remove', allow: true, target: activeTarget, targetParticipant: 'accepted' },
  { name: 'owner cannot remove self', actor: actors.owner, action: 'remove', allow: false, status: 403, target: { userId: OWNER, memberStatus: 'active', seat: 'ksa' }, targetParticipant: 'owner' },
  { name: 'owner can close an open room', actor: actors.owner, action: 'close', allow: true },
  { name: 'owner can archive an open room', actor: actors.owner, action: 'archive', allow: true },
  { name: 'owner cannot accept', actor: actors.owner, action: 'accept', allow: false, status: 403 },
  { name: 'owner cannot list every room', actor: actors.owner, action: 'list_all', allow: false, status: 403 },
  { name: 'owner cannot staff-close', actor: actors.owner, action: 'staff_close', allow: false, status: 403 },
  { name: 'invitee can read', actor: actors.invitee, action: 'read', allow: true },
  { name: 'invitee can accept', actor: actors.invitee, action: 'accept', allow: true },
  { name: 'invitee can decline', actor: actors.invitee, action: 'decline', allow: true },
  { name: 'invitee cannot invite', actor: actors.invitee, action: 'invite', allow: false, status: 403, target: activeTarget },
  { name: 'invitee cannot rename', actor: actors.invitee, action: 'rename', allow: false, status: 403 },
  { name: 'invitee cannot close', actor: actors.invitee, action: 'close', allow: false, status: 403 },
  { name: 'invitee cannot archive', actor: actors.invitee, action: 'archive', allow: false, status: 403 },
  { name: 'accepted participant can read', actor: actors.accepted, action: 'read', allow: true },
  { name: 'accepted participant cannot invite', actor: actors.accepted, action: 'invite', allow: false, status: 403, target: activeTarget },
  { name: 'accepted participant cannot accept again', actor: actors.accepted, action: 'accept', allow: false, status: 403 },
  { name: 'accepted participant cannot close', actor: actors.accepted, action: 'close', allow: false, status: 403 },
  { name: 'accepted participant cannot rename', actor: actors.accepted, action: 'rename', allow: false, status: 403 },
  { name: 'declined participant cannot read', actor: actors.declined, action: 'read', allow: false, status: 403 },
  { name: 'removed participant cannot read', actor: actors.removed, action: 'read', allow: false, status: 403 },
  { name: 'approved sponsor can create', actor: actors.sponsor, action: 'create', allow: true },
  { name: 'sponsor outsider cannot read', actor: actors.sponsor, action: 'read', allow: false, status: 403 },
  { name: 'sponsor outsider cannot invite', actor: actors.sponsor, action: 'invite', allow: false, status: 403, target: activeTarget },
  { name: 'sponsor invitee can accept', actor: actors.sponsorInvitee, action: 'accept', allow: true },
  { name: 'sponsor invitee can decline', actor: actors.sponsorInvitee, action: 'decline', allow: true },
  { name: 'sponsor invitee cannot rename', actor: actors.sponsorInvitee, action: 'rename', allow: false, status: 403 },
  { name: 'pending sponsor cannot create', actor: actors.pendingSponsor, action: 'create', allow: false, status: 403 },
  { name: 'staff can list every room', actor: actors.staff, action: 'list_all', allow: true },
  { name: 'staff can close any open room', actor: actors.staff, action: 'staff_close', allow: true, room: { status: 'open', openedBy: 'admin' } },
  { name: 'staff can read a room', actor: actors.staff, action: 'read', allow: true },
  { name: 'staff cannot rename', actor: actors.staff, action: 'rename', allow: false, status: 403 },
  { name: 'staff cannot invite', actor: actors.staff, action: 'invite', allow: false, status: 403, target: activeTarget },
  { name: 'staff cannot archive', actor: actors.staff, action: 'archive', allow: false, status: 403 },
  { name: 'staff cannot accept', actor: actors.staff, action: 'accept', allow: false, status: 403 },
  { name: 'staff member who is not owner cannot rename', actor: actors.staffMember, action: 'rename', allow: false, status: 403 },
  { name: 'staff member can still close as staff', actor: actors.staffMember, action: 'staff_close', allow: true },
  { name: 'owner cannot invite into a closed room', actor: actors.owner, action: 'invite', allow: false, status: 409, room: { status: 'closed', openedBy: 'member' }, target: activeTarget },
  { name: 'invitee cannot accept a closed room', actor: actors.invitee, action: 'accept', allow: false, status: 409, room: { status: 'closed', openedBy: 'member' } },
  { name: 'invitee can decline a closed room', actor: actors.invitee, action: 'decline', allow: true, room: { status: 'closed', openedBy: 'member' } },
  { name: 'owner cannot rename an archived room', actor: actors.owner, action: 'rename', allow: false, status: 409, room: { status: 'archived', openedBy: 'member' } },
]

for (const row of matrix) {
  test(row.name, () => {
    const decision = decideDealRoom({
      actor: row.actor,
      action: row.action,
      room: row.room === undefined ? openRoom : row.room,
      target: row.target,
      targetParticipant: row.targetParticipant,
    })
    assert.equal(decision.allow, row.allow, row.name)
    if (!decision.allow && row.status) assert.equal(decision.status, row.status, row.name)
  })
}

test('approved sponsor means an active sponsor seat', () => {
  assert.equal(isInvitableMember({ memberStatus: 'active', seat: 'sponsor' }), true)
  assert.equal(isInvitableMember({ memberStatus: 'active', seat: 'ksa' }), true)
  assert.equal(isInvitableMember({ memberStatus: 'invited', seat: 'sponsor' }), false)
  assert.equal(isInvitableMember({ memberStatus: 'suspended', seat: 'intl' }), false)
  assert.equal(isInvitableMember(null), false)
  assert.equal(participantState({ role: 'owner', invite_status: 'accepted' }), 'owner')
  assert.equal(participantState({ role: 'member', invite_status: 'invited' }), 'invited')
  assert.equal(participantState({ role: 'member', invite_status: 'declined' }), 'declined')
  assert.equal(participantState(null), 'none')
})

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`function ${name}`)
  const asAt = sql.indexOf('as $$\n', start)
  const end = sql.indexOf('\n$$;', asAt)
  assert.ok(start >= 0 && asAt > start && end > asAt, name)
  return sql.slice(asAt, end)
}

test('migration keeps RLS and does not grant anon', () => {
  const files = readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort()
  assert.ok(files.includes(migrationName))
  assert.ok(files.at(-1)! > migrationName)
  assert.ok(files.includes('20260930120000_lock_majlis_views_and_scratch.sql'))
  assert.ok(migrationName > '20260930120000_lock_majlis_views_and_scratch.sql')
  assert.match(migration, /alter table public\.rooms enable row level security/)
  assert.match(migration, /alter table public\.rooms force row level security/)
  assert.match(migration, /alter table public\.room_participants enable row level security/)
  assert.match(migration, /alter table public\.room_participants force row level security/)
  assert.match(migration, /revoke all on table public\.rooms from public, anon, authenticated/)
  assert.match(migration, /revoke all on table public\.room_participants from public, anon, authenticated/)
  assert.equal(/grant\s+(select|insert|update|delete|all)[^;]*\sto\s+anon\b/i.test(migration), false)
  assert.equal(/grant\s+execute[^;]*\sto\s+anon\b/i.test(migration), false)
  assert.match(migration, /grant select on table public\.rooms to authenticated/)
  assert.match(migration, /grant select on table public\.room_participants to authenticated/)
  assert.equal(/for\s+insert\b/i.test(migration), false)
  assert.equal(/for\s+update\b/i.test(migration), false)
  assert.equal(/for\s+delete\b/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(migration), false)
  assert.equal(/eyJ|sk_live|BEGIN PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY\s*=/i.test(migration), false)
})

test('rooms gain owner, purpose, one subject, and archived', () => {
  assert.match(migration, /owner_member_id uuid/)
  assert.match(migration, /purpose text/)
  assert.match(migration, /re_opportunity_id uuid/)
  assert.match(migration, /opened_by text/)
  assert.match(migration, /status in \('open', 'closed', 'archived'\)/)
  assert.match(migration, /mandate_id is null or re_opportunity_id is null/)
  assert.match(migration, /opened_by = 'admin' or purpose is not null/)
  assert.match(migration, /on delete set null/)
  assert.match(migration, /set opened_by = 'admin'/)
  assert.match(migration, /role in \('owner', 'member'\)/)
  assert.match(migration, /invite_status in \('invited', 'accepted', 'declined', 'removed'\)/)
  assert.match(fnBody(migration, 'private.deal_room_visible'), /invite_status in \('invited', 'accepted'\)/)
  assert.match(fnBody(migration, 'private.deal_room_visible'), /private\.is_staff\(\)/)
  assert.match(migration, /using \(private\.deal_room_visible\(id\)\)/)
  assert.match(migration, /using \(private\.deal_room_visible\(room_id\)\)/)
})

test('list_member_rooms still returns admin cards only', () => {
  const body = fnBody(migration, 'public.list_member_rooms')
  assert.match(body, /private\.can_read_member_room\(\)/)
  assert.match(body, /opened_by = 'admin'/)
  assert.equal(body.match(/opened_by = 'admin'/g)?.length, 2)
  for (const key of ['id', 'is_demo', 'name', 'summary', 'sector', 'stage', 'member_count', 'host_name']) {
    assert.match(body, new RegExp(`'${key}'`))
  }
  assert.equal(body.includes('purpose'), false)
  assert.equal(body.includes('owner_member_id'), false)
})

test('sql role checks match the matrix and read the invitee mailbox from members', () => {
  const create = fnBody(migration, 'public.create_member_deal_room')
  const invite = fnBody(migration, 'private.place_deal_invite')
  const respond = fnBody(migration, 'public.respond_member_deal_room')
  const manage = fnBody(migration, 'public.manage_member_deal_room')
  const list = fnBody(migration, 'public.list_all_deal_rooms')
  const close = fnBody(migration, 'public.close_any_deal_room')
  assert.match(create, /private\.active_member\(p_actor\)/)
  assert.match(create, /'owner', 'accepted'/)
  assert.match(create, /opened_by/)
  assert.match(create, /invalid_subject/)
  assert.match(invite, /require_member_room/)
  assert.match(fnBody(migration, 'private.require_member_room'), /not_owner/)
  assert.match(fnBody(migration, 'private.require_member_room'), /role = 'owner'/)
  assert.match(fnBody(migration, 'private.require_member_room'), /invite_status = 'accepted'/)
  assert.match(invite, /not_invitable/)
  assert.match(invite, /cannot_invite_self/)
  assert.match(invite, /target\.status is distinct from 'active'/)
  assert.match(invite, /target\.seat not in \('ksa', 'intl', 'sponsor'\)/)
  assert.match(invite, /target\.email/)
  assert.equal(/p_email/.test(fnBody(migration, 'public.invite_member_deal_room')), false)
  assert.match(respond, /invite_status = 'invited'/)
  assert.match(respond, /not_invitee/)
  assert.match(respond, /'accepted'/)
  assert.match(respond, /'declined'/)
  assert.match(manage, /'rename'/)
  assert.match(manage, /'remove'/)
  assert.match(manage, /'close'/)
  assert.match(manage, /'archive'/)
  assert.match(manage, /place_deal_invite/)
  assert.match(manage, /cannot_remove_owner/)
  assert.match(list, /not_staff/)
  assert.match(list, /private\.actor_is_staff\(p_actor\)/)
  assert.equal(/email/i.test(list), false)
  assert.match(close, /not_staff/)
  assert.match(close, /status = 'closed'/)
  assert.match(fnBody(migration, 'private.actor_is_staff'), /s\.role in \('staff', 'master'\)/)
  for (const name of [
    'public.create_member_deal_room(uuid, text, text, uuid, uuid)',
    'public.invite_member_deal_room(uuid, uuid, uuid)',
    'public.respond_member_deal_room(uuid, uuid, text)',
    'public.manage_member_deal_room(uuid, uuid, text, text, text, uuid)',
    'public.list_all_deal_rooms(uuid)',
    'public.close_any_deal_room(uuid, uuid)',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function ${name.replace(/[()]/g, '\\$&')} from public, anon, authenticated`))
    assert.match(migration, new RegExp(`grant execute on function ${name.replace(/[()]/g, '\\$&')} to service_role`))
  }
})

const SECRET_KEYS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM', 'GMAIL_SERVICE_ACCOUNT_JSON', 'PUBLIC_SITE_URL']

function clearMailEnv() {
  for (const key of SECRET_KEYS) delete process.env[key]
}

test('invite letter uses the shared sender and example.com fixtures only', () => {
  clearMailEnv()
  process.env.PUBLIC_SITE_URL = 'https://boardarabia.com'
  const message = dealRoomInviteMail({
    to: DB_MAIL,
    roomName: 'North room',
    purpose: 'A private conversation about a live mandate.',
    ownerName: 'Example Owner',
  })
  assert.match(message.subject, /deal room/)
  assert.match(message.text, /Example Owner invited you to the deal room "North room"/)
  assert.match(message.text, /https:\/\/boardarabia\.com\/dashboard\/rooms/)
  assert.equal(hasBoardFooter(message.text, message.html), true)
  assert.equal(hasSubstantiveBody(message.text, message.html), true)
  assert.equal(message.text.includes('\u2014'), false)
  assert.equal(/calendly|calendar\.app\.google|calendar\.google|cal\.com/i.test(`${message.text}\n${message.html}`), false)
  assert.equal(message.text.includes(DB_MAIL), false)
})

test('unset Gmail secrets send nothing', async () => {
  clearMailEnv()
  let called = false
  const lines: string[] = []
  const skipped = await sendDealRoomInvite(
    {
      to: DB_MAIL,
      roomName: 'North room',
      purpose: 'A private conversation about a live mandate.',
      ownerName: 'Example Owner',
    },
    {
      send: async () => {
        called = true
        return { dryRun: false, provider: 'gmail', providerId: null, status: 'sent' }
      },
      log: (line) => lines.push(line),
    },
  )
  assert.equal(skipped.status, 'skipped')
  assert.match(skipped.detail, /GMAIL_CLIENT_ID/)
  assert.match(skipped.detail, /GMAIL_CLIENT_SECRET/)
  assert.match(skipped.detail, /GMAIL_REFRESH_TOKEN/)
  assert.equal(called, false)
  assert.equal(lines.join('\n').includes('@'), false)
  assert.equal(missingDealRoomMailSecrets().length, 3)

  process.env.GMAIL_SERVICE_ACCOUNT_JSON = 'not-a-credential'
  assert.equal(missingDealRoomMailSecrets().includes('GMAIL_CLIENT_ID'), true)
  clearMailEnv()
})

test('a scheduled invite does not block the caller', async () => {
  let finished = false
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  deliverDealRoomInvite(pending.then(() => {
    finished = true
  }))
  assert.equal(finished, false)
  release()
  await dealRoomInviteSettled()
  assert.equal(finished, true)
})

type Call = { name: string; args: Record<string, unknown> }

function caller(userId: string, status: MemberStatus, seat: MemberSeat | null, staff = false): DealCaller {
  return { userId, memberStatus: status, seat, staff }
}

function fakeGate(opts: {
  caller: DealCaller
  participant?: ParticipantState
  room?: DealRoomContext | null
  target?: DealTarget | null
  targetParticipant?: ParticipantState
  data?: unknown
  error?: { message: string } | null
  calls: Call[]
}): DealGate {
  return {
    caller: opts.caller,
    loadRoom: async () => (opts.room === undefined ? openRoom : opts.room),
    loadParticipant: async (_roomId, userId) => {
      if (userId === opts.caller.userId) return opts.participant ?? 'none'
      return opts.targetParticipant ?? 'invited'
    },
    loadTarget: async (memberId) => {
      if (opts.target === null) return null
      return opts.target ?? { userId: memberId, memberStatus: 'active', seat: 'ksa' }
    },
    call: async (name, args) => {
      opts.calls.push({ name, args })
      return { data: opts.data ?? { ok: true }, error: opts.error ?? null }
    },
  }
}

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function run(endpoint: DealEndpoint, body: unknown, gate: DealGate, deliver?: (job: { to: string }) => void) {
  const jobs: { to: string }[] = []
  const response = await handleDealRoom(post(`https://boardarabia.com/functions/v1/deal-room-${endpoint}`, body), endpoint, {
    open: async () => gate,
    deliverInvite: (job) => {
      jobs.push(job)
      deliver?.(job)
    },
  })
  const payload = await response.json()
  return { response, payload, jobs }
}

test('create is limited to an active member and writes through the service function', async () => {
  const deniedCalls: Call[] = []
  const denied = await run('create', { name: 'North room', purpose: 'A private conversation.' }, fakeGate({
    caller: caller(OUTSIDER, 'invited', 'ksa'),
    calls: deniedCalls,
  }))
  assert.equal(denied.response.status, 403)
  assert.equal(deniedCalls.length, 0)

  const calls: Call[] = []
  const created = await run('create', {
    name: 'North room',
    purpose: 'A private conversation.',
    mandate_id: ROOM,
    re_opportunity_id: null,
    email: 'other@example.com',
  }, fakeGate({
    caller: caller(OWNER, 'active', 'sponsor'),
    data: { ok: true, room_id: ROOM, status: 'open' },
    calls,
  }))
  assert.equal(created.response.status, 200)
  assert.equal(created.payload.room_id, ROOM)
  assert.equal(calls[0]?.name, 'create_member_deal_room')
  assert.equal(calls[0]?.args.p_actor, OWNER)
  assert.equal(calls[0]?.args.p_mandate_id, ROOM)
  assert.equal('email' in (calls[0]?.args ?? {}), false)
  assert.equal(JSON.stringify(created.payload).includes('@'), false)
})

test('invite sends the mailbox from the database and does not wait', async () => {
  let started = false
  let finished = false
  const calls: Call[] = []
  const invited = await run('invite', {
    room_id: ROOM,
    member_id: INVITEE,
    email: 'other@example.com',
  }, fakeGate({
    caller: caller(OWNER, 'active', 'ksa'),
    participant: 'owner',
    data: {
      ok: true,
      invite_status: 'invited',
      room_name: 'North room',
      purpose: 'A private conversation.',
      owner_name: 'Example Owner',
      invitee_email: DB_MAIL,
    },
    calls,
  }), () => {
    started = true
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        finished = true
        resolve()
      }, 20)
    })
  })
  assert.equal(invited.response.status, 200)
  assert.equal(started, true)
  assert.equal(finished, false)
  assert.equal(invited.jobs[0]?.to, DB_MAIL)
  assert.equal(invited.payload.invite_status, 'invited')
  assert.equal(invited.payload.invitee_email, undefined)
  assert.equal(JSON.stringify(invited.payload).includes('@'), false)
  assert.equal(calls[0]?.name, 'invite_member_deal_room')
  assert.equal(calls[0]?.args.p_member_id, INVITEE)
  assert.equal('p_email' in (calls[0]?.args ?? {}), false)
  await new Promise((resolve) => setTimeout(resolve, 30))
})

test('an outsider, an invitee, and an accepted participant cannot invite', async () => {
  for (const row of [
    { caller: caller(OUTSIDER, 'active', 'ksa'), participant: 'none' as const },
    { caller: caller(INVITEE, 'active', 'intl'), participant: 'invited' as const },
    { caller: caller(ACCEPTED, 'active', 'ksa'), participant: 'accepted' as const },
  ]) {
    const calls: Call[] = []
    const result = await run('invite', { room_id: ROOM, member_id: SPONSOR }, fakeGate({
      caller: row.caller,
      participant: row.participant,
      calls,
    }))
    assert.equal(result.response.status, 403, row.participant)
    assert.equal(calls.length, 0)
    assert.equal(result.jobs.length, 0)
  }
})

test('only the invitee can accept or decline', async () => {
  const calls: Call[] = []
  const accepted = await run('respond', { room_id: ROOM, decision: 'accept' }, fakeGate({
    caller: caller(INVITEE, 'active', 'sponsor'),
    participant: 'invited',
    data: { ok: true, invite_status: 'accepted' },
    calls,
  }))
  assert.equal(accepted.response.status, 200)
  assert.equal(calls[0]?.name, 'respond_member_deal_room')
  assert.equal(calls[0]?.args.p_decision, 'accept')

  const ownerCalls: Call[] = []
  const owner = await run('respond', { room_id: ROOM, decision: 'decline' }, fakeGate({
    caller: caller(OWNER, 'active', 'ksa'),
    participant: 'owner',
    calls: ownerCalls,
  }))
  assert.equal(owner.response.status, 403)
  assert.equal(ownerCalls.length, 0)

  const outsiderCalls: Call[] = []
  const outsider = await run('respond', { room_id: ROOM, decision: 'accept' }, fakeGate({
    caller: caller(OUTSIDER, 'active', 'ksa'),
    participant: 'none',
    calls: outsiderCalls,
  }))
  assert.equal(outsider.response.status, 403)
  assert.equal(outsiderCalls.length, 0)
})

test('owner manage renames, removes, closes, and archives; add uses the invite mailbox', async () => {
  const renameCalls: Call[] = []
  const renamed = await run('manage', { room_id: ROOM, action: 'rename', name: 'South room' }, fakeGate({
    caller: caller(OWNER, 'active', 'ksa'),
    participant: 'owner',
    data: { ok: true, name: 'South room' },
    calls: renameCalls,
  }))
  assert.equal(renamed.response.status, 200)
  assert.equal(renameCalls[0]?.name, 'manage_member_deal_room')
  assert.equal(renameCalls[0]?.args.p_action, 'rename')
  assert.equal(renamed.jobs.length, 0)

  const addCalls: Call[] = []
  const added = await run('manage', { room_id: ROOM, action: 'add', member_id: INVITEE, email: 'other@example.com' }, fakeGate({
    caller: caller(OWNER, 'active', 'ksa'),
    participant: 'owner',
    data: { ok: true, invite_status: 'invited', invitee_email: DB_MAIL, room_name: 'North room', purpose: 'A private conversation.', owner_name: 'Example Owner' },
    calls: addCalls,
  }))
  assert.equal(added.jobs[0]?.to, DB_MAIL)
  assert.equal(added.payload.invitee_email, undefined)

  for (const action of ['remove', 'close', 'archive'] as const) {
    const calls: Call[] = []
    const result = await run('manage', { room_id: ROOM, action, member_id: INVITEE }, fakeGate({
      caller: caller(OWNER, 'active', 'ksa'),
      participant: 'owner',
      targetParticipant: 'accepted',
      data: { ok: true, status: action },
      calls,
    }))
    assert.equal(result.response.status, 200, action)
    assert.equal(calls[0]?.args.p_action, action)
    assert.equal(result.jobs.length, 0)
  }

  const memberCalls: Call[] = []
  const member = await run('manage', { room_id: ROOM, action: 'close' }, fakeGate({
    caller: caller(ACCEPTED, 'active', 'ksa'),
    participant: 'accepted',
    calls: memberCalls,
  }))
  assert.equal(member.response.status, 403)
  assert.equal(memberCalls.length, 0)
})

test('staff can list and close; members and anon cannot', async () => {
  const calls: Call[] = []
  const listed = await run('staff', { action: 'list' }, fakeGate({
    caller: caller(STAFF, 'none', null, true),
    data: { ok: true, rooms: [{ id: ROOM, name: 'North room' }] },
    calls,
  }))
  assert.equal(listed.response.status, 200)
  assert.equal(calls[0]?.name, 'list_all_deal_rooms')
  assert.equal(calls[0]?.args.p_actor, STAFF)

  const closeCalls: Call[] = []
  const closed = await run('staff', { action: 'close', room_id: ROOM }, fakeGate({
    caller: caller(STAFF, 'none', null, true),
    room: { status: 'open', openedBy: 'admin' },
    data: { ok: true, status: 'closed', room_id: ROOM },
    calls: closeCalls,
  }))
  assert.equal(closed.response.status, 200)
  assert.equal(closeCalls[0]?.name, 'close_any_deal_room')

  const memberCalls: Call[] = []
  const member = await run('staff', { action: 'list' }, fakeGate({
    caller: caller(OWNER, 'active', 'ksa'),
    calls: memberCalls,
  }))
  assert.equal(member.response.status, 403)
  assert.equal(memberCalls.length, 0)

  const anon = await handleDealRoom(post('https://boardarabia.com/functions/v1/deal-room-staff', { action: 'list' }), 'staff', {
    open: async () => ({ error: 'Unauthorized', status: 401 }),
    deliverInvite: () => {},
  })
  assert.equal(anon.status, 401)
})

test('a failed invite does not schedule mail', async () => {
  const calls: Call[] = []
  const result = await run('invite', { room_id: ROOM, member_id: INVITEE }, fakeGate({
    caller: caller(OWNER, 'active', 'ksa'),
    participant: 'owner',
    error: { message: 'already_participant' },
    calls,
  }))
  assert.equal(result.response.status, 409)
  assert.equal(result.jobs.length, 0)
})

test('both links are rejected before a write', async () => {
  const calls: Call[] = []
  const result = await run('create', {
    name: 'North room',
    purpose: 'A private conversation.',
    mandate_id: ROOM,
    re_opportunity_id: INVITEE,
  }, fakeGate({
    caller: caller(OWNER, 'active', 'ksa'),
    calls,
  }))
  assert.equal(result.response.status, 400)
  assert.equal(calls.length, 0)
})

test('public responses drop mailbox fields', () => {
  const payload = publicPayload({
    ok: true,
    invite_status: 'invited',
    invitee_email: DB_MAIL,
    room_name: 'North room',
  })
  assert.equal(payload.invitee_email, undefined)
  assert.equal(payload.room_name, 'North room')
  assert.equal(JSON.stringify(payload).includes('@'), false)
})

test('each deal room function requires a JWT and checks membership in code', () => {
  const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  for (const name of DEAL_ROOM_FUNCTIONS) {
    const block = config.split(`[functions.${name}]`)[1]?.split(/\n\[/)[0] ?? ''
    assert.match(block, /verify_jwt = true/, name)
    assert.equal(/verify_jwt = false/.test(block), false, name)
    const source = readFileSync(path.join(root, 'supabase/functions', name, 'index.ts'), 'utf8')
    assert.match(source, /openDealGate/)
    assert.match(source, /handleDealRoom/)
    assert.match(source, /sendDealRoomInvite/)
  }
  const http = readFileSync(path.join(root, 'supabase/functions/_shared/deal_room_http.ts'), 'utf8')
  const session = readFileSync(path.join(root, 'supabase/functions/_shared/deal_room_session.ts'), 'utf8')
  assert.match(http, /endpoint === 'staff'/)
  assert.match(http, /not_active_member/)
  assert.match(http, /decideDealRoom/)
  assert.match(session, /\.from\('members'\)/)
  assert.match(session, /\.from\('staff_users'\)/)
  assert.match(session, /auth\.getUser/)
  assert.equal(http.includes('\u2014'), false)
  assert.equal(session.includes('\u2014'), false)
})
