import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { androidBackAction, carriesAuthCallback, classifyIncomingUrl } from '../src/shell/incomingLink.ts'
import {
  APP_LINK_PATHS,
  appleAppSiteAssociation,
  assetLinks,
  readFingerprints,
  writeWellKnown,
} from './write-well-known.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('auth callbacks and invite links route into the app', () => {
  const magic = classifyIncomingUrl(
    'https://boardarabia.com/auth/confirm?token_hash=abc&type=magiclink',
  )
  assert.equal(magic.kind, 'in-app')
  if (magic.kind !== 'in-app') return
  assert.equal(magic.path, '/auth/confirm')
  assert.equal(magic.search, '?token_hash=abc&type=magiclink')
  assert.equal(carriesAuthCallback(magic), true)

  const recovery = classifyIncomingUrl(
    'https://www.boardarabia.com/auth/confirm#access_token=tok&refresh_token=ref&type=recovery',
  )
  assert.equal(recovery.kind, 'in-app')
  if (recovery.kind !== 'in-app') return
  assert.equal(recovery.path, '/auth/confirm')
  assert.match(recovery.hash, /access_token=tok/)
  assert.equal(carriesAuthCallback(recovery), true)

  const oauth = classifyIncomingUrl('https://boardarabia.com/auth/confirm?code=oauth-code')
  assert.equal(oauth.kind, 'in-app')
  if (oauth.kind !== 'in-app') return
  assert.equal(carriesAuthCallback(oauth), true)

  const invite = classifyIncomingUrl('https://boardarabia.com/apply?invite=one-time')
  assert.equal(invite.kind, 'in-app')
  if (invite.kind !== 'in-app') return
  assert.equal(invite.path, '/apply')
  assert.equal(invite.search, '?invite=one-time')
  assert.equal(carriesAuthCallback(invite), false)

  const login = classifyIncomingUrl('https://boardarabia.com/login')
  assert.equal(login.kind, 'in-app')
  if (login.kind !== 'in-app') return
  assert.equal(login.path, '/login')
})

test('the custom scheme and localhost stay in the app', () => {
  const scheme = classifyIncomingUrl('com.boardarabia.app://auth/confirm?type=invite&token_hash=abc')
  assert.equal(scheme.kind, 'in-app')
  if (scheme.kind !== 'in-app') return
  assert.equal(scheme.path, '/auth/confirm')
  assert.equal(carriesAuthCallback(scheme), true)

  const triple = classifyIncomingUrl('com.boardarabia.app:///dashboard/profile')
  assert.equal(triple.kind, 'in-app')
  if (triple.kind !== 'in-app') return
  assert.equal(triple.path, '/dashboard/profile')

  const local = classifyIncomingUrl('https://localhost/register/verify?code=1')
  assert.equal(local.kind, 'in-app')
  if (local.kind !== 'in-app') return
  assert.equal(local.path, '/register/verify')

  const capacitor = classifyIncomingUrl('capacitor://localhost/login/staff')
  assert.equal(capacitor.kind, 'in-app')
  if (capacitor.kind !== 'in-app') return
  assert.equal(capacitor.path, '/login/staff')
})

test('other hosts open outside the app and unsafe urls are dropped', () => {
  const external = classifyIncomingUrl('https://example.com/apply?invite=1')
  assert.deepEqual(external, { kind: 'external', href: 'https://example.com/apply?invite=1' })
  assert.equal(classifyIncomingUrl('javascript:alert(1)').kind, 'ignore')
  assert.equal(classifyIncomingUrl('data:text/html,hi').kind, 'ignore')
  assert.equal(classifyIncomingUrl('mailto:person@example.com').kind, 'ignore')
  assert.equal(classifyIncomingUrl('https://boardarabia.com/auth/../../etc/passwd').kind, 'ignore')
  assert.equal(classifyIncomingUrl('https://user:pass@boardarabia.com/login').kind, 'ignore')
  assert.equal(classifyIncomingUrl('https://boardarabia.com:444/login').kind, 'external')
  assert.equal(classifyIncomingUrl('com.boardarabia.app://evil.example/phish').kind, 'ignore')
})

test('the Android back button follows history and then exits', () => {
  assert.equal(androidBackAction(true), 'back')
  assert.equal(androidBackAction(false), 'exit')
})

test('well-known files use env vars and never a literal team id or fingerprint', () => {
  const team = 'AB12CD34EF'
  const digest = 'ab'.repeat(32)
  const association = appleAppSiteAssociation(team)
  assert.deepEqual(association.applinks.details[0].appIDs, [`${team}.com.boardarabia.app`])
  assert.deepEqual(
    association.applinks.details[0].components.map((entry: { '/': string }) => entry['/']),
    APP_LINK_PATHS,
  )
  assert.throws(() => appleAppSiteAssociation('not-a-team'))
  assert.deepEqual(readFingerprints(`${digest}, ${digest.toUpperCase()}`), [
    digest.toUpperCase().replace(/../g, '$&:').slice(0, -1),
  ])
  const links = assetLinks(readFingerprints(digest))
  assert.equal(links[0].target.package_name, 'com.boardarabia.app')
  assert.equal(links[0].target.sha256_cert_fingerprints.length, 1)

  const dir = mkdtempSync(path.join(tmpdir(), 'ba-well-known-'))
  try {
    assert.deepEqual(writeWellKnown(dir, {}), [])
    const written = writeWellKnown(dir, {
      APPLE_TEAM_ID: team,
      ANDROID_APP_LINK_SHA256: digest,
    })
    assert.deepEqual(written.sort(), [
      '.well-known/apple-app-site-association',
      '.well-known/assetlinks.json',
    ])
    const aasa = readFileSync(path.join(dir, '.well-known/apple-app-site-association'), 'utf8')
    assert.match(aasa, new RegExp(`${team}\\.com\\.boardarabia\\.app`))
    assert.equal(aasa.includes('@'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  const source = read('scripts/write-well-known.mjs')
  assert.equal(source.includes('APPLE_TEAM_ID'), true)
  assert.equal(source.includes('ANDROID_APP_LINK_SHA256'), true)
  assert.equal(/[A-Z0-9]{10}\.com\.boardarabia\.app/.test(source), false)
  assert.equal(/[0-9A-F]{2}(?::[0-9A-F]{2}){31}/.test(source), false)

  const pages = read('.github/workflows/pages.yml')
  assert.equal(pages.includes('APPLE_TEAM_ID'), false)
  assert.equal(pages.includes('ANDROID_APP_LINK_SHA256'), false)
  assert.match(read('package.json'), /scripts\/write-well-known\.mjs/)
})

test('the native shell registers links, back, external browser, and the brand bar', () => {
  const shell = read('src/shell/NativeShell.tsx')
  const config = read('capacitor.config.ts')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const plist = read('ios/App/App/Info.plist')
  const entitlements = read('ios/App/App/App.entitlements')
  const css = read('src/index.css')
  assert.match(shell, /appUrlOpen/)
  assert.match(shell, /backButton/)
  assert.match(shell, /Browser\.open/)
  assert.match(shell, /SystemBarsStyle\.Dark/)
  assert.match(shell, /ba-native/)
  assert.match(shell, /isNativePlatform/)
  assert.match(config, /style:\s*'DARK'/)
  assert.match(manifest, /android:scheme="https"/)
  assert.match(manifest, /android:host="boardarabia.com"/)
  assert.match(manifest, /android:scheme="com\.boardarabia\.app"/)
  assert.match(plist, /com\.boardarabia\.app/)
  assert.match(entitlements, /applinks:boardarabia\.com/)
  assert.match(css, /html\.ba-native/)
  assert.match(css, /safe-area-inset-top/)
  assert.match(css, /#1c1343/)
  assert.equal(shell.includes('\u2014'), false)
  assert.equal(read('src/shell/incomingLink.ts').includes('\u2014'), false)
})
