import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const workflow = read('.github/workflows/majlis-reminders.yml')
const invite = read('.github/workflows/invite-reminders.yml')

test('the majlis reminder job is gated and runs every 15 minutes', () => {
  assert.match(workflow, /schedule:\n {4}- cron: '\*\/15 \* \* \* \*'\n/)
  assert.equal(workflow.match(/^\s*- cron:/gm)?.length, 1)
  const jobs = workflow.split(/^jobs:\s*$/m)[1] ?? ''
  const remind = jobs.split(/^ {2}remind:\s*$/m)[1] ?? ''
  assert.match(remind, /^ {4}if:\s*\$\{\{\s*vars\.MAJLIS_REMINDERS_ENABLED == 'true'\s*\}\}\s*$/m)
  const ifAt = remind.search(/if:\s*\$\{\{\s*vars\.MAJLIS_REMINDERS_ENABLED == 'true'\s*\}\}/)
  const stepsAt = remind.search(/^ {4}steps:\s*$/m)
  assert.ok(ifAt >= 0 && stepsAt > ifAt)
  const inviteDispatch = /^ {2}workflow_dispatch:\s*$/m.test(invite)
  assert.equal(/^ {2}workflow_dispatch:\s*$/m.test(workflow), inviteDispatch)
  assert.equal(inviteDispatch, true)
})

test('the majlis reminder workflow uses secret references and no literal secret', () => {
  assert.match(workflow, /x-majlis-cron:\s*\$\{MAJLIS_CRON_SECRET\}/)
  assert.match(workflow, /\$\{origin\}\/functions\/v1\/majlis-reminders/)
  assert.match(workflow, /\$\{\{\s*secrets\.MAJLIS_CRON_SECRET\s*\}\}/)
  assert.match(workflow, /\$\{\{\s*secrets\.SUPABASE_URL\s*\}\}/)
  const secretNames = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((match) => match[1])
  assert.deepEqual(secretNames, ['MAJLIS_CRON_SECRET', 'SUPABASE_URL'])
  const withoutRefs = workflow
    .replace(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/g, '')
    .replace(/\$\{\{\s*vars\.MAJLIS_REMINDERS_ENABLED == 'true'\s*\}\}/g, '')
  assert.equal(withoutRefs.includes('secrets.'), false)
  assert.equal(/https?:\/\/\S+/i.test(withoutRefs), false)
  assert.equal(/supabase\.co/i.test(workflow), false)
  assert.equal(/iirqbizwanyhgkhanntq/.test(workflow), false)
  assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(workflow), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(workflow), false)
  assert.equal(/apikey|access_token|refresh_token|service_role/i.test(workflow), false)
  assert.match(workflow, /\[redacted\]/)
  assert.match(workflow, /MAJLIS_CRON_SECRET or SUPABASE_URL is unset/)
  assert.equal(workflow.includes('\u2014'), false)
  assert.equal(workflow.includes('\u2013'), false)
  for (const name of readdirSync(path.join(root, '.github/workflows'))) {
    if (name === 'majlis-reminders.yml') continue
    assert.equal(read(`.github/workflows/${name}`).includes('majlis-reminders'), false, name)
  }
})
