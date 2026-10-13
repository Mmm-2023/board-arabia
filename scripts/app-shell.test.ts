import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const SIGNING_FILE = /\.(jks|keystore|p12|mobileprovision|cer|pem)$/i

function walk(dir: string, found: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const abs = path.join(dir, name)
    const rel = path.relative(root, abs)
    const stat = statSync(abs)
    if (stat.isDirectory()) walk(abs, found)
    else if (SIGNING_FILE.test(name)) found.push(rel)
  }
}

test('the native shell uses the Board Arabia app id and the Vite output', () => {
  const config = read('capacitor.config.ts')
  assert.match(config, /appId:\s*'com\.boardarabia\.app'/)
  assert.match(config, /appName:\s*'Board Arabia'/)
  assert.match(config, /webDir:\s*'dist'/)
  assert.match(read('android/app/build.gradle'), /applicationId "com\.boardarabia\.app"/)
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">Board Arabia<\/string>/)
  assert.match(read('ios/App/App/Info.plist'), /<string>Board Arabia<\/string>/)
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /PRODUCT_BUNDLE_IDENTIFIER = com\.boardarabia\.app;/)
  assert.equal(read('assets/logo.svg'), read('public/favicon.svg'))
})

test('the app build stays at / and does not run the Pages prerender', () => {
  const buildApp = read('scripts/build-app.mjs')
  assert.match(buildApp, /VITE_BASE_PATH:\s*'\/'/)
  assert.equal(buildApp.includes('prerender.mjs'), false)
  assert.equal(buildApp.includes('write-ar-redirects.mjs'), false)
  const scripts = JSON.parse(read('package.json')).scripts
  assert.equal(scripts['build:app'], 'node scripts/build-app.mjs')
  assert.match(scripts.build, /scripts\/prerender\.mjs/)
  assert.match(scripts.build, /scripts\/write-ar-redirects\.mjs/)
  const pages = read('.github/workflows/pages.yml')
  assert.match(pages, /run: npm run build/)
  assert.equal(pages.includes('build:app'), false)
  assert.equal(pages.includes('capacitor'), false)
})

test('CI builds an Android debug APK and an unsigned iOS simulator app', () => {
  const workflow = read('.github/workflows/app-builds.yml')
  assert.match(workflow, /pull_request:/)
  assert.match(workflow, /workflow_dispatch:/)
  assert.equal(/^\s*push:/m.test(workflow), false)
  assert.equal(/^\s*schedule:/m.test(workflow), false)
  assert.match(workflow, /reactivecircus\/android-emulator-runner@v2/)
  assert.match(workflow, /name: android-home-screenshot/)
  assert.equal(workflow.includes('cron:'), false)
  assert.match(workflow, /assembleDebug/)
  assert.match(workflow, /iphonesimulator/)
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/)
  assert.match(workflow, /name: android-debug-apk/)
  assert.match(workflow, /name: ios-simulator-app/)
  assert.equal(workflow.includes('secrets.'), false)
  assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(workflow), false)
  assert.equal(workflow.includes('BEGIN PRIVATE KEY'), false)
  assert.equal(workflow.includes('.jks'), false)
  assert.equal(workflow.includes('.keystore'), false)
  assert.equal(workflow.includes('.p12'), false)
  const signing: string[] = []
  walk(root, signing)
  assert.deepEqual(signing, [])
})
