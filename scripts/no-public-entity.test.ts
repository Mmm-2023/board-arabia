import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { LEGAL_ENTITY_LINE } from './public-nammco.mjs'

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

/** Legal pages may carry the exact entity line. Every other path still fails. */
export function allowsExactEntitySource(relativePath: string): boolean {
  const rel = relativePath.split('\\').join('/')
  if (rel === 'src/content/legal/privacy.en.ts' || rel === 'src/content/legal/terms.en.ts') return true
  if (rel === 'dist/privacy/index.html' || rel === 'dist/terms/index.html') return true
  return /^dist\/assets\/legal-pages-[A-Za-z0-9_-]+\.js$/.test(rel)
}

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
    const scanned = allowsExactEntitySource(rel) ? text.split(LEGAL_ENTITY_LINE).join('') : text
    if (allowsExactEntitySource(rel) && rel.startsWith('src/')) {
      if (!text.includes(LEGAL_ENTITY_LINE)) hits.push(`${rel}: missing exact entity line`)
    }
    const found = publicEntityHits(scanned)
    if (found.length) hits.push(`${rel}: ${found.join(', ')}`)
  }
  assert.deepEqual(hits, [])
})
