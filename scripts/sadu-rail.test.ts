import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const svg = readFileSync(new URL('../public/brand/ba-sadu-rail.svg', import.meta.url), 'utf8')
const rail = readFileSync(new URL('../src/components/SaduRail.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/sadu-rail.css', import.meta.url), 'utf8')
const landing = readFileSync(new URL('../src/pages/LandingPage.tsx', import.meta.url), 'utf8')
const members = readFileSync(new URL('../src/pages/ForMembersPage.tsx', import.meta.url), 'utf8')
const capital = readFileSync(new URL('../src/pages/ForCapitalPage.tsx', import.meta.url), 'utf8')
const partners = readFileSync(new URL('../src/pages/PartnersPage.tsx', import.meta.url), 'utf8')
const apply = readFileSync(new URL('../src/pages/ApplyPage.tsx', import.meta.url), 'utf8')
const directory = readFileSync(new URL('../src/pages/dashboard/DirectoryPage.tsx', import.meta.url), 'utf8')
const lockup = readFileSync(new URL('../src/components/BrandLockup.tsx', import.meta.url), 'utf8')

const allowedHex = new Set(['#4b3f9a', '#3a8a4c', '#e8e4f7', '#1c1343'])

test('sadu rail svg uses locked token fills only', () => {
  assert.match(svg, /viewBox="0 0 16 64"/)
  assert.match(svg, /var\(--ba-indigo, #4B3F9A\)/)
  assert.match(svg, /var\(--ba-sadu-green, #3A8A4C\)/)
  assert.match(svg, /var\(--ba-lavender-mist, #E8E4F7\)/)
  const hexes = svg.match(/#[0-9A-Fa-f]{3,8}/g) ?? []
  assert.ok(hexes.length > 0)
  for (const hex of hexes) {
    assert.ok(allowedHex.has(hex.toLowerCase()), hex)
  }
  assert.equal(svg.includes('\u2014'), false)
})

test('rail utility is full width, quiet half width, and hidden on small screens', () => {
  assert.match(css, /\.ba-sadu-rail \{[\s\S]*width: 64px/)
  assert.match(css, /\.ba-sadu-rail--quiet \{[\s\S]*width: 32px/)
  assert.match(css, /\.ba-sadu-rail--hero \{[\s\S]*top: 5rem/)
  assert.match(css, /max-width: 767px[\s\S]*display: none/)
  assert.match(css, /--ba-sadu-green:\s*#3a8a4c/i)
  assert.match(rail, /ba-sadu-rail--quiet/)
  assert.match(rail, /aria-hidden="true"/)
  assert.match(rail, /pointer-events: none|ba-sadu-rail/)
})

test('landing hero and marketing routes reuse the rail, product surfaces do not', () => {
  assert.match(landing, /<SaduRail hero \/>/)
  assert.match(landing, /<SaduRail quiet \/>/)
  assert.match(members, /<SaduRail quiet \/>/)
  assert.match(capital, /<SaduRail quiet \/>/)
  assert.match(partners, /<SaduRail quiet \/>/)
  assert.equal(apply.includes('SaduRail'), false)
  assert.equal(apply.includes('ba-sadu-rail'), false)
  assert.equal(directory.includes('SaduRail'), false)
  assert.equal(directory.includes('ba-sadu-rail'), false)
})

test('hero wordmark reuses the serif lockup, not the display stack', () => {
  assert.match(lockup, /type Size = 'nav' \| 'hero'/)
  assert.match(lockup, /font-serif/)
  assert.match(lockup, /Founding membership/)
  assert.match(landing, /<BrandLockup tone="on-dark" size="hero" heading \/>/)
  assert.equal(landing.includes('text-[clamp(3.4rem,11vw,8.5rem)]'), false)
  assert.equal(landing.includes('\u2014'), false)
})
