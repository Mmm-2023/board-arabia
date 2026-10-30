/**
 * Universal links and Android app links for the Pages site.
 * Team id and certificate fingerprints come from the environment.
 * When those vars are unset, this writes nothing.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ID = 'com.boardarabia.app'
const TEAM_ID = /^[A-Z0-9]{10}$/
const HEX64 = /^[0-9A-Fa-f]{64}$/

export const APP_LINK_PATHS = [
  '/',
  '/auth/*',
  '/login',
  '/login/*',
  '/apply',
  '/apply/*',
  '/dashboard',
  '/dashboard/*',
]

export function normalizeFingerprint(value) {
  const compact = String(value || '').trim().replaceAll(':', '')
  if (!HEX64.test(compact)) return null
  return compact
    .toUpperCase()
    .replace(/../g, '$&:')
    .slice(0, -1)
}

export function readFingerprints(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const seen = new Set()
  for (const part of raw.split(/[\s,]+/)) {
    const next = normalizeFingerprint(part)
    if (next) seen.add(next)
  }
  return [...seen]
}

export function appleAppSiteAssociation(teamId) {
  if (!TEAM_ID.test(teamId)) {
    throw new Error('APPLE_TEAM_ID must be 10 letters or digits')
  }
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${teamId}.${APP_ID}`],
          components: APP_LINK_PATHS.map((route) => ({ '/': route })),
        },
      ],
    },
  }
}

export function assetLinks(fingerprints) {
  if (!fingerprints.length) throw new Error('ANDROID_APP_LINK_SHA256 is empty')
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]
}

export function writeWellKnown(dist, env) {
  const teamId = String(env.APPLE_TEAM_ID || '').trim()
  const fingerprints = readFingerprints(env.ANDROID_APP_LINK_SHA256)
  const written = []
  if (!teamId && fingerprints.length === 0) return written

  const dir = path.join(dist, '.well-known')
  fs.mkdirSync(dir, { recursive: true })

  if (teamId) {
    const body = `${JSON.stringify(appleAppSiteAssociation(teamId), null, 2)}\n`
    fs.writeFileSync(path.join(dir, 'apple-app-site-association'), body)
    written.push('.well-known/apple-app-site-association')
  }
  if (fingerprints.length) {
    const body = `${JSON.stringify(assetLinks(fingerprints), null, 2)}\n`
    fs.writeFileSync(path.join(dir, 'assetlinks.json'), body)
    written.push('.well-known/assetlinks.json')
  }
  return written
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const dist = path.resolve(process.argv[2] || path.join(root, 'dist'))
  const written = writeWellKnown(dist, process.env)
  if (written.length === 0) {
    console.log('well-known files skipped: APPLE_TEAM_ID and ANDROID_APP_LINK_SHA256 are unset')
  } else {
    for (const file of written) console.log(`wrote ${file}`)
  }
}
