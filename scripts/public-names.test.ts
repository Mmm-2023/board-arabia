import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { publicEntityHits } from './no-public-entity.test.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Locked public credit. Any other Michael in the scanned files fails. */
const ALLOWED_MICHAEL = 'Michael Mateer, Co-Founder and CEO'

const LEGAL_SOURCES = ['src/content/legal/terms.en.ts', 'src/content/legal/privacy.en.ts'] as const

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function list(dir: string, suffix: string, prefix: string) {
  return readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => `${prefix}${name}`)
}

function publicNameFiles() {
  return [
    ...list('handoff', '.md', 'handoff/'),
    'README.md',
    ...list('.github/workflows', '.yml', '.github/workflows/'),
  ]
}

/** First names that must not appear in public docs or workflow files. */
function staffNameHits(text: string) {
  const hits: string[] = []
  for (const line of text.split('\n')) {
    const stripped = line.split(ALLOWED_MICHAEL).join('')
    for (const match of stripped.matchAll(/\b(sasha|faith|michael)\b/gi)) {
      hits.push(match[0])
    }
  }
  return hits
}

function legalSourceBanned(source: string) {
  return /nammco/i.test(source) || publicEntityHits(source).length > 0
}

test('public docs and workflows contain no staff first names', () => {
  const files = publicNameFiles()
  assert.ok(files.includes('handoff/ba-hy1-public-names.md'))
  assert.ok(files.includes('README.md'))
  assert.ok(files.includes('.github/workflows/retention-sweep.yml'))
  assert.ok(files.includes('.github/workflows/suggest-intros.yml'))
  const hits: string[] = []
  for (const file of files) {
    const lines = read(file).split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      for (const token of staffNameHits(lines[index])) {
        hits.push(`${file}:${index + 1} ${token}`)
      }
    }
  }
  assert.deepEqual(hits, [])
})

test('a bad staff line fails and the locked credit passes', () => {
  assert.deepEqual(staffNameHits('Sasha applies the migration'), ['Sasha'])
  assert.deepEqual(staffNameHits('routines owned by sasha'), ['sasha'])
  assert.deepEqual(staffNameHits('Faith Example'), ['Faith'])
  assert.deepEqual(staffNameHits('in good faith'), ['faith'])
  assert.deepEqual(staffNameHits('Michael clicks the secret'), ['Michael'])
  assert.deepEqual(staffNameHits('SKIPPED BY MICHAEL'), ['MICHAEL'])
  assert.deepEqual(staffNameHits(ALLOWED_MICHAEL), [])
  assert.deepEqual(staffNameHits(`The desk names ${ALLOWED_MICHAEL}.`), [])
  assert.deepEqual(staffNameHits(`${ALLOWED_MICHAEL}\nSasha applies`), ['Sasha'])
})

test('legal page sources name Board Arabia and carry no entity or registration line', () => {
  for (const file of LEGAL_SOURCES) {
    const source = read(file)
    assert.equal(/nammco/i.test(source), false, file)
    assert.equal(/\bCR\s*\d{10}\b/.test(source), false, file)
    assert.deepEqual(publicEntityHits(source), [], file)
    assert.equal(source.includes('[BA ENTITY]'), false, file)
    assert.equal(source.includes('commercial registration number [CR]'), false, file)
    assert.match(source, /Board Arabia is the operator of the Platform/)
  }
  const resolve = read('src/content/legal/resolve.ts')
  assert.match(resolve, /from '\.\.\/\.\.\/config\/legalPageIdentity\.ts'/)
  assert.match(resolve, /publishedLegalIdentity\(\)/)
  assert.match(resolve, /'\[AI PROVIDER\]': 'aiProvider'/)
  const identity = read('src/config/legalPageIdentity.ts')
  assert.equal(identity.includes('VITE_LEGAL_BA_ENTITY'), false)
  assert.equal(identity.includes('VITE_LEGAL_CR'), false)
  assert.equal(identity.includes('import.meta.env'), false)
  assert.equal(legalSourceBanned('powered by nammco'), true)
  assert.equal(legalSourceBanned('Board Arabia is the operator of the Platform'), false)
})
