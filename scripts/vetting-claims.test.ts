import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

/** Public marketing, SEO, llms.txt, and the member or email strings this wave changed. */
const BANNED =
  /vetted|selective|admin-reviewed|reviewed (intros|mandates|rooms)|vouched/i

const PRE_VET_SCOPE =
  'It checks you are real, a good fit and a decision maker. Nothing about any business or deal.'

const CAPACITY_CHECK =
  'Used only inside a platform sum, and only after our admin team has looked at it. We do not verify the amount.'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|txt|html)$/.test(name)) out.push(full)
  }
  return out
}

function publicCopyFiles() {
  const files = [
    path.join(root, 'index.html'),
    path.join(root, 'public', 'llms.txt'),
    path.join(root, 'src', 'lib', 'inviteLink.ts'),
    path.join(root, 'supabase', 'functions', '_shared', 'peer_invite.ts'),
    path.join(root, 'supabase', 'functions', '_shared', 'membership_steps.ts'),
    ...walk(path.join(root, 'src', 'content')),
    ...walk(path.join(root, 'src', 'components')),
  ]
  const pages = path.join(root, 'src', 'pages')
  for (const name of readdirSync(pages)) {
    const full = path.join(pages, name)
    if (statSync(full).isDirectory()) continue
    if (name.endsWith('.tsx')) files.push(full)
  }
  return files
}

function hits(text: string, file: string) {
  const found: string[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (BANNED.test(lines[i])) found.push(`${path.relative(root, file)}:${i + 1}`)
  }
  return found
}

test('public copy, SEO and llms.txt do not claim vetting or endorsement', () => {
  const found = publicCopyFiles().flatMap((file) => hits(readFileSync(file, 'utf8'), file))
  assert.deepEqual(found, [])
  for (const line of [
    MEMBER_VIEWS.mandates.empty,
    MEMBER_VIEWS.realEstate.partnersForming,
    MEMBER_VIEWS.realEstate.partnersEmpty,
  ]) {
    assert.equal(BANNED.test(line), false, line)
  }
})

test('home and apply routes keep the scope lines and drop the old claims', async () => {
  const app = read('src/App.tsx')
  assert.match(app, /path="\/" element=\{<LandingPage/)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const homeMod = await vite.ssrLoadModule('/src/pages/LandingPage.tsx')
    const applyMod = await vite.ssrLoadModule('/src/pages/ApplyPage.tsx')
    const home = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(homeMod.LandingPage)),
    )
    const apply = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/apply'] }, createElement(applyMod.ApplyPage)),
    )
    assert.match(home, /Membership for Chairperson, Board members and C-suite executives/)
    assert.equal(home.includes('Reviewed membership'), false)
    assert.match(home, /Capital briefs shared through admin\. No cold outreach\./)
    assert.match(home, /Peers admitted by application and personal review\./)
    assert.match(home, /A founding membership by application/)
    assert.match(home, /Admin reads every application and handles every mandate intro and real estate intro\./)
    assert.match(apply, /Check/)
    assert.equal(/pre-vet/i.test(apply), false)
    assert.match(apply, new RegExp(PRE_VET_SCOPE.replace(/[.]/g, '\\.')))
    assert.match(apply, new RegExp(CAPACITY_CHECK.replace(/[.]/g, '\\.')))
    assert.equal(apply.includes('verifies it'), false)
    for (const html of [home, apply]) {
      assert.equal(BANNED.test(html), false)
      assert.equal(html.includes('\u2014'), false)
      assert.equal(html.includes('\u2013'), false)
      assert.equal(/\bsponsor/i.test(html), false)
    }
    assert.equal((home.match(/nammco/gi) || []).length, 1)
    assert.match(home, /powered by nammco/)
  } finally {
    await vite.close()
  }
})
