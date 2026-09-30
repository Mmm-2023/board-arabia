import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test, { mock } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'
import { LANDING_PREVIEW_EXAMPLES } from '../src/lib/landingPreview.ts'
import {
  PREVIEW_DWELL_SECONDS,
  PREVIEW_LOCK_KEY,
  PREVIEW_VIEW_MIN_PX,
  attachPreviewLock,
  isPreviewMember,
  lockBlurClass,
  openingLock,
  previewVisibility,
  readPreviewLock,
  type PreviewSight,
} from '../src/lib/previewLock.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem(key: string) {
      return data.has(key) ? (data.get(key) ?? null) : null
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  }
}

test('home page keeps membership after founding and does not mount the lock overlay', () => {
  const landing = source('src/pages/LandingPage.tsx')
  const founding = landing.indexOf('<FoundingSection />')
  const membership = landing.indexOf('<MembershipSection />')
  const faq = landing.indexOf('<FaqList')
  assert.ok(founding >= 0)
  assert.ok(membership > founding)
  assert.ok(faq > membership)
  assert.equal(landing.includes('<DashboardPreview'), false)
  assert.equal(landing.includes('Sign in'), false)
  assert.equal(landing.includes('See live deals as a member'), false)
  assert.equal(landing.includes('\u2014'), false)
  assert.equal(landing.includes('\u2013'), false)
  const members = source('src/pages/ForMembersPage.tsx')
  assert.match(members, /<DashboardPreview \/>/)
  const wire = source('src/components/DashboardPreview.tsx')
  assert.match(wire, /IntersectionObserver/)
  assert.match(wire, /attachPreviewLock/)
  assert.match(wire, /prefers-reduced-motion/)
  assert.match(wire, /isPreviewMember/)
  assert.equal(wire.includes('8000'), false)
  assert.equal(wire.includes('\u2014'), false)
  const dwell = source('src/lib/previewLock.ts')
  assert.equal(dwell.match(/PREVIEW_DWELL_SECONDS = 8/g)?.length, 1)
  assert.equal(dwell.includes('8000'), false)
  assert.equal(dwell.includes('\u2014'), false)
})

test('dwell timer locks a visitor and writes sessionStorage', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
  try {
    assert.equal(PREVIEW_DWELL_SECONDS, 8)
    const storage = memoryStorage()
    let locked = false
    let report: ((sight: PreviewSight) => void) | null = null
    const stop = attachPreviewLock({
      member: false,
      storage,
      onLock: () => {
        locked = true
      },
      observe(next) {
        report = next
        return () => {}
      },
    })
    assert.ok(report)
    report({ inView: true, scrolledPast: false })
    mock.timers.tick(PREVIEW_DWELL_SECONDS * 1000 - 1)
    assert.equal(locked, false)
    assert.equal(readPreviewLock(storage), false)
    mock.timers.tick(1)
    assert.equal(locked, true)
    assert.equal(storage.getItem(PREVIEW_LOCK_KEY), '1')
    stop()
  } finally {
    mock.timers.reset()
  }
})

test('leaving the preview cancels the dwell timer', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const storage = memoryStorage()
    let locked = false
    let report: ((sight: PreviewSight) => void) | null = null
    const stop = attachPreviewLock({
      member: false,
      storage,
      onLock: () => {
        locked = true
      },
      observe(next) {
        report = next
        return () => {}
      },
    })
    assert.ok(report)
    report({ inView: true, scrolledPast: false })
    mock.timers.tick(3_000)
    report({ inView: false, scrolledPast: false })
    mock.timers.tick(PREVIEW_DWELL_SECONDS * 1000)
    assert.equal(locked, false)
    assert.equal(readPreviewLock(storage), false)
    stop()
  } finally {
    mock.timers.reset()
  }
})

test('scrolling past the preview locks without waiting out the dwell', () => {
  const storage = memoryStorage()
  let locked = false
  const stop = attachPreviewLock({
    member: false,
    storage,
    onLock: () => {
      locked = true
    },
    observe(report) {
      report({ inView: false, scrolledPast: true })
      return () => {}
    },
  })
  assert.equal(locked, true)
  assert.equal(readPreviewLock(storage), true)
  assert.equal(
    previewVisibility({ isIntersecting: false, intersectionHeight: 0, bottom: -1 }).scrolledPast,
    true,
  )
  assert.equal(
    previewVisibility({
      isIntersecting: true,
      intersectionHeight: PREVIEW_VIEW_MIN_PX,
      bottom: 40,
    }).inView,
    true,
  )
  assert.equal(
    previewVisibility({ isIntersecting: true, intersectionHeight: 8, bottom: 400 }).inView,
    false,
  )
  stop()
})

test('sessionStorage keeps the preview locked on a later visit in the same session', () => {
  const storage = memoryStorage()
  const first = attachPreviewLock({
    member: false,
    storage,
    onLock: () => {},
    observe(report) {
      report({ inView: false, scrolledPast: true })
      return () => {}
    },
  })
  first()
  assert.equal(readPreviewLock(storage), true)

  let locked = false
  let observed = false
  const second = attachPreviewLock({
    member: false,
    storage,
    onLock: () => {
      locked = true
    },
    observe() {
      observed = true
      return () => {}
    },
  })
  assert.equal(locked, true)
  assert.equal(observed, false)
  assert.equal(openingLock({ member: false, stored: true }), true)
  second()
})

test('logged-in members bypass the preview lock', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
  try {
    assert.equal(isPreviewMember('active'), true)
    assert.equal(isPreviewMember('invited'), true)
    assert.equal(isPreviewMember('suspended'), false)
    assert.equal(isPreviewMember(null), false)
    assert.equal(openingLock({ member: true, stored: true }), false)

    const storage = memoryStorage()
    storage.setItem(PREVIEW_LOCK_KEY, '1')
    let locked = false
    let observed = false
    const stop = attachPreviewLock({
      member: true,
      storage,
      onLock: () => {
        locked = true
      },
      observe() {
        observed = true
        return () => {}
      },
    })
    mock.timers.tick(PREVIEW_DWELL_SECONDS * 1000)
    assert.equal(locked, false)
    assert.equal(observed, false)
    stop()
  } finally {
    mock.timers.reset()
  }
})

test('reduced motion skips the blur transition', () => {
  assert.equal(lockBlurClass(true).includes('transition'), false)
  assert.match(lockBlurClass(true), /blur-md/)
  assert.match(lockBlurClass(false), /transition-\[filter\]/)
  assert.match(lockBlurClass(false), /duration-300/)
})

test('locked preview overlay is labelled, focusable, and not a keyboard trap', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/components/DashboardPreviewFrame.tsx')
    const locked = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.DashboardPreviewFrame, {
          deals: LANDING_PREVIEW_EXAMPLES,
          locked: true,
          reduceMotion: true,
          density: 'landing',
        }),
      ),
    )
    assert.match(locked, /See live deals as a member/)
    assert.match(locked, /Apply for consideration/)
    assert.match(locked, /Sign in/)
    assert.match(locked, /href="\/apply"/)
    assert.match(locked, /href="\/login"/)
    assert.equal(locked.includes('/login/staff'), false)
    assert.equal(locked.includes('/login?next=/dashboard'), false)
    assert.match(locked, /aria-live="polite"/)
    assert.match(locked, /aria-labelledby="preview-lock-title"/)
    assert.match(locked, /role="region"/)
    assert.match(locked, /data-preview-lock="locked"/)
    assert.match(locked, /blur-md/)
    assert.match(locked, /inert/)
    assert.match(locked, /Energy transition/)
    assert.equal((locked.match(/min-h-11/g) || []).length >= 2, true)
    assert.equal(locked.includes('transition-[filter]'), false)
    assert.equal(locked.includes('duration-300'), false)
    assert.equal(locked.includes('tabindex="-1"'), false)
    assert.equal(locked.includes('\u2014'), false)

    const motion = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.DashboardPreviewFrame, {
          deals: LANDING_PREVIEW_EXAMPLES,
          locked: true,
          reduceMotion: false,
        }),
      ),
    )
    assert.match(motion, /transition-\[filter\]/)
    assert.match(motion, /See live deals as a member/)

    const frame = source('src/components/DashboardPreviewFrame.tsx')
    assert.equal(frame.includes('onKeyDown'), false)
    assert.equal(frame.includes('\u2014'), false)
    assert.equal(frame.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})
