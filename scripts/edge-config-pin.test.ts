import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function functionFolders(): string[] {
  const dir = path.join(root, 'supabase/functions')
  return readdirSync(dir)
    .filter((name) => {
      const lower = name.toLowerCase()
      if (lower.startsWith('_') || lower === 'shared' || lower.includes('shared')) return false
      return statSync(path.join(dir, name)).isDirectory()
    })
    .sort()
}

function explicitVerifyJwt(toml: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = toml.match(new RegExp(`\\[functions\\.${escaped}\\]([^\\[]*)`))
  if (!section) return false
  return /^\s*verify_jwt\s*=\s*(true|false)\s*$/m.test(section[1])
}

test('every function folder has an explicit verify_jwt pin', () => {
  const toml = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  const missing = functionFolders().filter((name) => !explicitVerifyJwt(toml, name))
  assert.deepEqual(missing, [], `missing verify_jwt: ${missing.join(', ')}`)
})
