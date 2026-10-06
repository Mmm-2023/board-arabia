/**
 * After prerender, hash every inline script in dist and stamp one CSP
 * meta tag plus the referrer policy onto every HTML file. Re-running
 * replaces the meta, so a later edit to 404.html or shell.html picks up
 * new hashes on the next build. Hashes are not stored in source.
 */
import fs from 'node:fs'
import path from 'node:path'
import { contentSecurityPolicy, inlineScriptBodies, scriptHash, stampHtml } from './csp-policy.mjs'

export function htmlFiles(distDir) {
  const files = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.html')) files.push(full)
    }
  }
  walk(distDir)
  return files.sort()
}

export function stampDistCsp(distDir, env = process.env) {
  const files = htmlFiles(distDir)
  if (!files.length) throw new Error(`no HTML in ${distDir}`)
  const hashes = []
  const seen = new Set()
  for (const file of files) {
    for (const body of inlineScriptBodies(fs.readFileSync(file, 'utf8'))) {
      const hash = scriptHash(body)
      if (seen.has(hash)) continue
      seen.add(hash)
      hashes.push(hash)
    }
  }
  const policy = contentSecurityPolicy({
    supabaseUrl: env.VITE_SUPABASE_URL,
    analyticsFlag: env.VITE_ANALYTICS_ENABLED,
    posthogHost: env.VITE_POSTHOG_HOST,
    scriptHashes: hashes,
  })
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, stampHtml(html, policy))
  }
  return { policy, files: files.length, hashes: hashes.length }
}
