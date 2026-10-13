import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const PATTERNS: Array<[string, RegExp]> = [
  ['NAMMCO Holding', /NAMMCO Holding/i],
  ['Holding Co', /Holding Co\b/i],
  ['CR number', /\bCR\s*\d{10}\b/i],
  ['CR digits', /(?<!\d)7043252647(?!\d)/],
]

/** No file exceptions. The footer credit does not match these patterns. */
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

test('src, the built bundle, and prerendered pages name no holding entity or CR', () => {
  assert.deepEqual(publicEntityHits('NAMMCO Holding Co. CR 7043252647'), [
    'NAMMCO Holding',
    'Holding Co',
    'CR number',
    'CR digits',
  ])
  assert.deepEqual(publicEntityHits('powered by nammco'), [])
  assert.deepEqual(publicEntityHits('Example Holdings'), [])
  assert.deepEqual(publicEntityHits('Nahla Industrial Holding'), [])
  assert.deepEqual(publicEntityHits('commercial registration number where asked'), [])

  const dist = path.join(root, 'dist')
  assert.equal(existsSync(dist), true, 'dist is missing; build before this test')
  const files: string[] = []
  walk(path.join(root, 'src'), files)
  walk(dist, files)
  const hits: string[] = []
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/')
    if (rel.startsWith('dist/') && !DIST_TEXT.test(rel)) continue
    const text = readFileSync(file).toString('utf8')
    const found = publicEntityHits(text)
    if (found.length) hits.push(`${rel}: ${found.join(', ')}`)
  }
  assert.deepEqual(hits, [])
})
