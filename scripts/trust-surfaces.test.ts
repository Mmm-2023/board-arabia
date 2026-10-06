import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { dealFileHint, dealUploadNote } from '../src/lib/aiToolCopy.ts'
import { deckHintText } from '../src/lib/dueDiligenceCopy.ts'
import {
  AI_UPLOAD_HINT,
  APPLY_STRIP,
  DD_PRIVATE_LINE,
  DD_RETENTION_LINE,
  ISO_FOOTNOTE,
  LANDING_STRIP_LINK,
  REGISTER_STRIP,
  SECURITY_H1,
  registerStrip,
  TRUST_COPY,
  UPLOAD_HANDLING,
} from '../src/content/trust.ts'
import {
  contentSecurityPolicy,
  inlineScriptBodies,
  readCspMeta,
  scriptHash,
  stampHtml,
} from './csp-policy.mjs'
import { strayPublicNammco } from './public-nammco.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(relative) {
  return readFileSync(path.join(root, relative), 'utf8')
}

const BANNED = [
  'bank-grade',
  'military-grade',
  'fully secure',
  '100% private',
  'hack-proof',
  'nca-compliant',
  'nca compliant',
  'never leaves saudi arabia',
  'never leaves frankfurt',
  'legally reviewed',
  'approved by counsel',
  'only you can see your files',
  'backed up daily',
  'coming soon',
  'security contact',
  'security mailbox',
  'security.txt',
  'we name that provider',
  'leaked password',
  'leaked passwords',
  'leaked-password',
  'breached password',
  'breached passwords',
  'compromised password',
  'compromised passwords',
  'have i been pwned',
  'hibp',
  'openai',
  'x.ai',
  'anthropic',
  'chatgpt',
]

function assertDoNotSay(label, text) {
  const lower = text.toLowerCase()
  for (const phrase of BANNED) {
    assert.equal(lower.includes(phrase), false, `${label} contains ${phrase}`)
  }
  assert.equal(/\bxai\b/i.test(text), false, `${label} names xai`)
  assert.equal(/\bgrok\b/i.test(text), false, `${label} names grok`)
  assert.equal(/\bbackups?\b/i.test(text), false, `${label} mentions backup`)
  assert.equal(/security@/i.test(text), false, `${label} has a security mailbox`)
  assert.equal(text.includes('\u2014'), false, `${label} has an em dash`)
  assert.equal(text.includes('\u2013'), false, `${label} has an en dash`)
  assert.equal(/[\u0600-\u06FF]/.test(text), false, `${label} has Arabic`)
  const rest = text.split(ISO_FOOTNOTE).join('')
  assert.equal(/ISO\s*27001/i.test(rest), false, `${label} claims ISO outside the footnote`)
  assert.equal(/SOC\s*2/i.test(rest), false, `${label} claims SOC outside the footnote`)
  assert.equal(/\bcertified\b/i.test(rest), false, `${label} says certified`)
}

test('trust copy passes the do-not-say list and names no company', () => {
  const copy = TRUST_COPY.join('\n')
  assertDoNotSay('trust copy', copy)
  assert.equal(/nammco/i.test(copy), false)
  assert.equal(/\bthe desk\b/i.test(copy), false)
  assert.match(copy, /Sign-up asks you to confirm your email and is protected against automated abuse/)
  assert.equal(copy.includes('application forms'), false)
  assert.match(copy, /Two-step sign-in with an authenticator app is required for admin/)
  assert.match(copy, /unless you choose to share it with admin/)
  assert.match(copy, /a specialist AI provider/)
  assert.equal(copy.includes('We name that provider'), false)
  assert.match(ISO_FOOTNOTE, /does not hold an ISO 27001 or SOC 2 certification/)
})

test('/security prerender output omits the DD 30-day line and keeps the allowed lines', async () => {
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const { render } = await vite.ssrLoadModule('/src/entry-ssr.tsx')
    const security = render('/security').body
    assert.match(security, new RegExp(SECURITY_H1))
    assert.match(security, /href="\/security"/)
    assert.match(security, /href="\/privacy"/)
    assert.match(security, /href="\/dashboard\/privacy"/)
    assert.match(security, /AI tool uploads and their results are deleted automatically after 30 days/)
    assert.equal(security.includes(DD_RETENTION_LINE), false)
    assert.match(security, /data-trust-footnote/)
    assertDoNotSay('security page', security)
    assert.equal(/\bthe desk\b/i.test(security), false)
    assert.equal(strayPublicNammco(security, 'security/index.html'), false)
    assert.equal((security.match(/<h1[\s>]/g) || []).length, 1)

    const landing = render('/').body
    assert.match(landing, /data-trust-strip="landing"/)
    assert.match(landing, new RegExp(`href="/security"[^>]*>${LANDING_STRIP_LINK}`))
    const closing = landing.indexOf('id="closing"')
    const strip = landing.indexOf('data-trust-strip="landing"')
    assert.equal(strip > -1 && closing > strip, true)

    const apply = render('/apply').body
    assert.match(apply, /data-trust-strip="apply"/)
    assert.match(apply, new RegExp(`${APPLY_STRIP}[\\s\\S]{0,200}href="/privacy"`))
    const submit = apply.indexOf('Submit for consideration')
    const applyStrip = apply.indexOf('data-trust-strip="apply"')
    assert.equal(submit > -1 && applyStrip > submit, true)

    assert.equal(registerStrip(false), '')
    assert.equal(registerStrip(true), REGISTER_STRIP)
    const registerSource = read('src/pages/apply/RegisterScreen.tsx')
    assert.match(registerSource, /registerStrip\(isTwoTierRegisterEnabled\(\)\)/)
    assert.match(registerSource, /data-trust-strip="register"/)
  } finally {
    await vite.close()
  }
})

test('routes, footer, sitemap source, and the legacy apply route stay put', () => {
  const app = read('src/App.tsx').split('\n')
  assert.match(app[97], /path="\/apply" element=\{<ApplyPage/)
  assert.match(read('src/App.tsx'), /path="\/security" element=\{<SecurityPage/)
  assert.match(read('src/components/Footer.tsx'), /label: 'Trust and privacy', to: '\/security'/)
  assert.match(read('src/content/seo.ts'), /'\/security'/)
  assert.match(read('scripts/prerender.mjs'), /'\/security'/)
  const login = read('src/pages/LoginPage.tsx')
  const line = 'Signed-in area. Never share your one-time code.'
  assert.equal(login.split(line).length - 1, 1)
  assert.match(read('index.html'), /name="referrer" content="strict-origin-when-cross-origin"/)
  assert.equal(read('index.html').includes('sha256-'), false)
})

test('upload hints follow the claim gate and do not copy the DD deck line', () => {
  assert.equal(deckHintText(false).includes(DD_PRIVATE_LINE), true)
  assert.equal(deckHintText(false).includes('Deleted automatically after 30 days.'), false)
  assert.match(deckHintText(true), /Deleted automatically after 30 days\./)
  const hint = dealFileHint(30)
  const note = dealUploadNote(30)
  assert.match(hint, /Only your account can open this file/)
  assert.match(hint, /Deleted automatically after 30 days/)
  assert.equal(hint.includes('this deck'), false)
  assert.equal(hint.includes('unless you choose to share'), false)
  assert.equal(note.includes('this deck'), false)
  assert.equal(note.includes('unless you choose to share'), false)
  assert.match(note, /deleted automatically after 30 days/i)
  assert.equal(AI_UPLOAD_HINT.includes('Deleted automatically after 30 days.'), true)
  assert.match(UPLOAD_HANDLING, /a specialist AI provider/)
  assert.equal(UPLOAD_HANDLING.includes('We name that provider'), false)
  assertDoNotSay('upload hints', [hint, note, AI_UPLOAD_HINT, UPLOAD_HANDLING, deckHintText(true)].join('\n'))
})

test('CSP is derived at build time and omits PostHog unless analytics is on', () => {
  const off = contentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    analyticsFlag: 'false',
    posthogHost: 'https://eu.i.posthog.com',
    scriptHashes: ['abc'],
  })
  assert.equal(off.includes('posthog'), false)
  assert.match(off, /https:\/\/example\.supabase\.co/)
  assert.match(off, /wss:\/\/example\.supabase\.co/)
  assert.match(off, /'sha256-abc'/)
  assert.match(off, /https:\/\/challenges\.cloudflare\.com/)
  assert.match(off, /object-src 'none'/)
  assert.match(off, /base-uri 'self'/)
  assert.match(off, /form-action 'self'/)
  assert.match(off, /style-src-attr 'unsafe-inline'/)
  assert.equal(/script-src[^;]*unsafe-inline/.test(off), false)
  assert.equal(/frame-ancestors/.test(off), false)
  const on = contentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    analyticsFlag: 'true',
    posthogHost: 'https://eu.i.posthog.com',
    scriptHashes: [],
  })
  assert.match(on, /script-src[^;]*https:\/\/eu\.i\.posthog\.com/)
  assert.match(on, /script-src[^;]*https:\/\/eu-assets\.i\.posthog\.com/)
  assert.match(on, /connect-src[^;]*https:\/\/eu\.i\.posthog\.com/)
  const other = contentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    analyticsFlag: 'true',
    posthogHost: 'https://eu.posthog.com',
    scriptHashes: [],
  })
  assert.match(other, /https:\/\/eu\.posthog\.com/)
  assert.equal(other.includes('eu-assets.i.posthog.com'), false)
  const policySource = read('scripts/csp-policy.mjs')
  assert.equal(policySource.includes('iirqbizwanyhgkhanntq'), false)
  assert.match(policySource, /VITE_POSTHOG_HOST/)
  assert.match(policySource, /VITE_ANALYTICS_ENABLED/)
  const crawlBuild = read('scripts/build-for-csp-crawl.mjs')
  assert.match(crawlBuild, /1x00000000000000000000AA/)
  assert.equal(crawlBuild.includes('eyJ'), false)
  const body = '\n  var example = 1;\n'
  const html = `<!doctype html><html><head><title>Example</title></head><body><script>${body}</script></body></html>`
  assert.deepEqual(inlineScriptBodies(html), [body])
  const hash = scriptHash(body)
  const stamped = stampHtml(html, contentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    analyticsFlag: false,
    scriptHashes: [hash],
  }))
  assert.equal(readCspMeta(stamped).includes(`sha256-${hash}`), true)
  assert.match(stamped, /name="referrer" content="strict-origin-when-cross-origin"/)
  const again = stampHtml(stamped, contentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    analyticsFlag: false,
    scriptHashes: [hash],
  }))
  assert.equal((again.match(/Content-Security-Policy/g) || []).length, 1)
  assert.equal((again.match(/name="referrer"/g) || []).length, 1)
})
