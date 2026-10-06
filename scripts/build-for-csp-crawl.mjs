/**
 * Build dist for the CSP crawl.
 * Supabase URL and anon key are read from the existing Pages workflow
 * (already public there). Analytics stays off. Turnstile uses Cloudflare's
 * documented always-pass test site key, never a real key.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pages = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8')

function readPages(name) {
  const match = pages.match(new RegExp(`^\\s+${name}:\\s+(\\S+)\\s*$`, 'm'))
  if (!match) throw new Error(`pages.yml is missing ${name}`)
  if (match[1].includes('${{')) throw new Error(`${name} is not a literal in pages.yml`)
  return match[1]
}

const env = {
  ...process.env,
  VITE_SUPABASE_URL: readPages('VITE_SUPABASE_URL'),
  VITE_SUPABASE_ANON_KEY: readPages('VITE_SUPABASE_ANON_KEY'),
  VITE_ANALYTICS_ENABLED: 'false',
  VITE_ANALYTICS_PRECONSENT_MODE: 'anonymous_counts',
  VITE_TWO_TIER_REGISTER_ENABLED: 'false',
  VITE_POSTHOG_HOST: 'https://eu.i.posthog.com',
  VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
}
delete env.VITE_POSTHOG_KEY

const result = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
