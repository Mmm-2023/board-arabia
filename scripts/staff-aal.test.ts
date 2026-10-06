import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { handleAiToolJob, type AiToolStore, type JobRow } from '../supabase/functions/ai-tool-job/handle.ts'
import { gateInviteMaster } from '../supabase/functions/invite-master/handle.ts'
import { handleDealRoom, type DealCaller, type DealGate } from '../supabase/functions/_shared/deal_room_http.ts'
import { aalFromVerifiedToken } from '../supabase/functions/_shared/session_aal.ts'
import {
  dealRoomStaffFlag,
  foreignRowRead,
  staffApiDecision,
} from '../supabase/functions/_shared/staff_auth.ts'
import {
  deckShareButtonLabel,
  parsePrivateWorkCounts,
  promptWasDismissed,
  rememberPromptDismissed,
  routeHold,
  shareButtonLabel,
  showMemberPrompt,
} from '../src/lib/mfaFlow.ts'

const STAFF = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'

function token(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.sig`
}

test('aal is read from a verified token payload', () => {
  assert.equal(aalFromVerifiedToken(token({ aal: 'aal1', sub: STAFF })), 'aal1')
  assert.equal(aalFromVerifiedToken(token({ aal: 'aal2', sub: STAFF })), 'aal2')
  assert.equal(aalFromVerifiedToken(token({ sub: STAFF })), null)
  assert.equal(aalFromVerifiedToken('not-a-token'), null)
})

test('requireStaff decision rejects aal1 and allows aal2', () => {
  assert.deepEqual(staffApiDecision({ userId: STAFF, role: 'staff', aal: 'aal1' }), {
    allow: false,
    status: 403,
    error: 'mfa_required',
    code: 'mfa_required',
  })
  assert.deepEqual(staffApiDecision({ userId: STAFF, role: 'master', aal: 'aal2' }), {
    allow: true,
    role: 'master',
  })
  assert.equal(staffApiDecision({ userId: MEMBER, role: null, aal: 'aal1' }).error, 'Not staff')
  const gate = readFileSync('supabase/functions/_shared/require_staff.ts', 'utf8')
  assert.match(gate, /aalFromVerifiedToken\(token\)/)
  const userAt = gate.indexOf('auth.getUser(token)')
  const aalAt = gate.indexOf('aalFromVerifiedToken(token)')
  const decisionAt = gate.indexOf('staffApiDecision(')
  assert.ok(userAt > 0 && userAt < aalAt && aalAt < decisionAt)
})

test('deal room staff flag and HTTP pass aal2 or return mfa_required', async () => {
  assert.equal(dealRoomStaffFlag({ role: 'staff', aal: 'aal1' }), 'mfa_required')
  assert.equal(dealRoomStaffFlag({ role: 'master', aal: 'aal2' }), 'staff')
  assert.equal(dealRoomStaffFlag({ role: null, aal: 'aal1' }), 'member')
  const session = readFileSync('supabase/functions/_shared/deal_room_session.ts', 'utf8')
  assert.match(session, /dealRoomStaffFlag/)
  assert.match(session, /code: 'mfa_required'/)
  assert.ok(session.indexOf('auth.getUser(token)') < session.indexOf('aalFromVerifiedToken(token)'))

  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const caller: DealCaller = {
    userId: STAFF,
    memberStatus: 'none',
    seat: null,
    staff: true,
    aal: 'aal2',
  }
  const gate: DealGate = {
    caller,
    loadRoom: async () => ({ status: 'open', openedBy: 'admin' }),
    loadParticipant: async () => 'none',
    loadTarget: async () => null,
    call: async (name, args) => {
      calls.push({ name, args })
      return { data: { ok: true, rooms: [] }, error: null }
    },
  }
  const response = await handleDealRoom(
    new Request('https://example.com/deal-room-staff', {
      method: 'POST',
      body: JSON.stringify({ action: 'list' }),
    }),
    'staff',
    { open: async () => gate, deliverInvite: () => undefined },
  )
  assert.equal(response.status, 200)
  assert.equal(calls[0]?.args.p_aal, 'aal2')

  const blocked = await handleDealRoom(
    new Request('https://example.com/deal-room-staff', { method: 'POST', body: '{}' }),
    'staff',
    {
      open: async () => ({ error: 'mfa_required', status: 403, code: 'mfa_required' }),
      deliverInvite: () => undefined,
    },
  )
  assert.equal(blocked.status, 403)
  const body = await blocked.json()
  assert.equal(body.code, 'mfa_required')
})

test('ai tool status hides unshared rows and rejects staff aal1', async () => {
  assert.equal(
    foreignRowRead({ ownerId: MEMBER, callerId: STAFF, callerIsStaff: true, aal: 'aal1', shared: true }),
    'mfa_required',
  )
  assert.equal(
    foreignRowRead({ ownerId: MEMBER, callerId: STAFF, callerIsStaff: true, aal: 'aal2', shared: false }),
    'hidden',
  )
  assert.equal(
    foreignRowRead({ ownerId: MEMBER, callerId: STAFF, callerIsStaff: true, aal: 'aal2', shared: true }),
    'shared',
  )
  assert.equal(
    foreignRowRead({ ownerId: MEMBER, callerId: MEMBER, callerIsStaff: false, aal: 'aal1', shared: false }),
    'owner',
  )

  const job: JobRow = {
    id: '77777777-7777-4777-8777-777777777777',
    member_id: MEMBER,
    tool_key: 'cfo_check',
    status: 'ready',
    step: 'done',
    storage_path: 'member/job/source.pdf',
    file_name: 'notes.pdf',
    mime_type: 'application/pdf',
    byte_size: 12,
    error: null,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
    shared_with_admin_at: null,
  }
  const store = {
    memberLive: async () => true,
    isStaff: async (userId: string) => userId === STAFF,
    jobById: async () => job,
    outputByJob: async () => ({ id: 'out', job_id: job.id, body: { title: 'Example', summary: 'Short', findings: [], questions: [], sources: [] }, created_at: job.created_at }),
  } as unknown as AiToolStore

  async function status(aal: string | null, shared: boolean) {
    job.shared_with_admin_at = shared ? '2026-10-06T00:00:00.000Z' : null
    return handleAiToolJob(
      new Request('https://example.com/ai-tool-job', {
        method: 'POST',
        body: JSON.stringify({ action: 'status', job_id: job.id }),
      }),
      {
        resolveUser: async () => ({ ok: true, userId: STAFF, aal }),
        store: () => store,
        now: () => new Date('2026-10-06T00:00:00.000Z'),
      },
    )
  }

  const aal1 = await status('aal1', true)
  assert.equal(aal1.status, 403)
  assert.equal((await aal1.json()).code, 'mfa_required')
  const hidden = await status('aal2', false)
  assert.equal(hidden.status, 404)
  const shared = await status('aal2', true)
  assert.equal(shared.status, 200)
})

test('invite-master stays master-only after aal2 and refuses aal1 before a write', () => {
  assert.deepEqual(gateInviteMaster({ userId: STAFF, role: 'master', aal: 'aal2' }), {
    allow: true,
    role: 'master',
  })
  assert.deepEqual(gateInviteMaster({ userId: STAFF, role: 'master', aal: 'aal1' }), {
    allow: false,
    status: 403,
    error: 'mfa_required',
    code: 'mfa_required',
  })
  const staff = gateInviteMaster({ userId: STAFF, role: 'staff', aal: 'aal2' })
  assert.equal(staff.allow, false)
  if (!staff.allow) assert.equal(staff.status, 403)
  if (!staff.allow) assert.notEqual(staff.error, 'mfa_required')

  const index = readFileSync('supabase/functions/invite-master/index.ts', 'utf8')
  const requireAt = index.indexOf('requireStaff(')
  const masterAt = index.indexOf('assertMasterCaller(')
  const insertAt = index.indexOf(".insert(")
  assert.ok(requireAt > 0 && requireAt < masterAt && masterAt < insertAt)
})

test('member prompt, share labels, and aggregate counts stay free of row content', () => {
  assert.equal(routeHold({ area: 'staff', currentLevel: 'aal1', verifiedFactor: false }), 'enrol')
  assert.equal(routeHold({ area: 'staff', currentLevel: 'aal1', verifiedFactor: true }), 'challenge')
  assert.equal(routeHold({ area: 'member', currentLevel: 'aal1', verifiedFactor: false }), 'clear')
  assert.equal(routeHold({ area: 'member', currentLevel: 'aal1', verifiedFactor: true }), 'challenge')
  assert.equal(routeHold({ area: 'staff', currentLevel: 'aal2', verifiedFactor: true }), 'clear')
  assert.equal(showMemberPrompt({ verifiedFactor: false, dismissed: false }), true)
  assert.equal(showMemberPrompt({ verifiedFactor: false, dismissed: true }), false)
  assert.equal(promptWasDismissed(MEMBER, rememberPromptDismissed(MEMBER, null), false), true)
  assert.equal(shareButtonLabel(false), 'Share with admin')
  assert.equal(shareButtonLabel(true), 'Stop sharing')
  assert.equal(deckShareButtonLabel(false), 'Share the deck file with admin')
  const counts = parsePrivateWorkCounts({
    due_diligence_decks: 2,
    due_diligence_jobs: { ready: 1 },
    due_diligence_reports: 1,
    due_diligence_reports_shared: 0,
    ai_tool_jobs: { failed: 1 },
    ai_tool_outputs: 1,
    ai_tool_outputs_shared: 0,
    ai_tool_notes: 1,
  })
  assert.equal(counts?.due_diligence_jobs.ready, 1)
  assert.equal(parsePrivateWorkCounts({ due_diligence_decks: 1, file_name: 'secret.pdf' }), null)
})
