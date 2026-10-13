import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const selfPath = fileURLToPath(import.meta.url)

function piece(...parts: string[]) {
  return parts.join('')
}

const entityWords = piece('NAM', 'MCO', ' ', 'Hol', 'ding')
const holdingCo = piece('Hol', 'ding', ' ', 'Co')
const crDigits = piece('7043', '252', '647')

const PATTERNS: Array<[string, RegExp]> = [
  ['entity', new RegExp(entityWords, 'i')],
  ['suffix', new RegExp(`${holdingCo}\\b`, 'i')],
  ['cr line', /\bCR\s*\d{10}\b/i],
  ['cr digits', new RegExp(`(?<!\\d)${crDigits}(?!\\d)`)],
]

/** No path exceptions except this file, which builds the needles from fragments. */
export function publicEntityHits(text: string): string[] {
  const hits: string[] = []
  for (const [label, pattern] of PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(text)) hits.push(label)
  }
  return hits
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
}

const DIST_TEXT = /\.(js|mjs|cjs|css|html|svg|json|map|txt)$/i

test('src, scripts, the built bundle, and prerendered pages name no holding entity or CR', () => {
  const sample = [entityWords, ' Co. CR ', crDigits].join('')
  assert.deepEqual(publicEntityHits(sample), ['entity', 'suffix', 'cr line', 'cr digits'])
  assert.deepEqual(publicEntityHits('powered by nammco'), [])
  assert.deepEqual(publicEntityHits('Example Holdings'), [])
  assert.deepEqual(publicEntityHits('Nahla Industrial Holding'), [])
  assert.deepEqual(publicEntityHits('commercial registration number where asked'), [])
  assert.deepEqual(publicEntityHits(readFileSync(selfPath, 'utf8')), [])

  const dist = path.join(root, 'dist')
  assert.equal(existsSync(dist), true, 'dist is missing; build before this test')
  const files: string[] = []
  walk(path.join(root, 'src'), files)
  walk(path.join(root, 'scripts'), files)
  walk(dist, files)
  const hits: string[] = []
  for (const file of files) {
    if (path.resolve(file) === path.resolve(selfPath)) continue
    const rel = path.relative(root, file).split(path.sep).join('/')
    if (rel.startsWith('dist/') && !DIST_TEXT.test(rel)) continue
    const text = readFileSync(file).toString('utf8')
    const found = publicEntityHits(text)
    if (found.length) hits.push(`${rel}: ${found.join(', ')}`)
  }
  assert.deepEqual(hits, [])
})
