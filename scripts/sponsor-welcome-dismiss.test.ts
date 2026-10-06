import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const DISMISS_SAVE_ERROR = 'We could not save that. Please try again.'

const source = readFileSync(new URL('../src/pages/dashboard/SponsorWelcomeGate.tsx', import.meta.url), 'utf8')

test('dismissal waits for dismiss_sponsor_welcome before it hides the welcome', async () => {
  assert.equal(source.includes("void supabase.rpc('dismiss_sponsor_welcome')"), false)
  assert.match(source, /await dismissSponsorWelcome\(\(name\) => supabase\.rpc\(name\)\)/)
  assert.match(source, /setOpen\(next\.open\)/)
  assert.equal(source.includes('\u2014') || source.includes('\u2013'), false)
  assert.equal(source.toLowerCase().includes('the desk'), false)

  let release: (value: { error: { message: string } | null }) => void = () => {}
  const pending = new Promise<{ error: { message: string } | null }>((resolve) => {
    release = resolve
  })
  let called = ''
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const mod = await vite.ssrLoadModule('/src/pages/dashboard/SponsorWelcomeGate.tsx')
    const task = mod.dismissSponsorWelcome((name: 'dismiss_sponsor_welcome') => {
      called = name
      return pending
    })
    let settled = false
    void task.then(() => {
      settled = true
    })
    await Promise.resolve()
    assert.equal(called, 'dismiss_sponsor_welcome')
    assert.equal(settled, false)

    release({ error: { message: 'database unavailable' } })
    const failed = await task
    const kept = mod.welcomeAfterDismiss(failed)
    assert.equal(kept.open, true)
    assert.equal(kept.error, DISMISS_SAVE_ERROR)
    assert.equal(JSON.stringify(kept).includes('database unavailable'), false)

    const saved = await mod.dismissSponsorWelcome(async () => ({ error: null }))
    assert.deepEqual(mod.welcomeAfterDismiss(saved), { open: false, error: '' })

    const html = renderToStaticMarkup(
      createElement(
        mod.SponsorWelcomeDismissFrame,
        { saving: false, error: DISMISS_SAVE_ERROR },
        createElement('p', null, 'What your seat includes'),
      ),
    )
    assert.match(html, /What your seat includes/)
    assert.match(html, /We could not save that\. Please try again\./)
    assert.match(html, /role="alert"/)

    const busy = renderToStaticMarkup(
      createElement(
        mod.SponsorWelcomeDismissFrame,
        { saving: true, error: '' },
        createElement('button', { type: 'button' }, 'Dismiss'),
      ),
    )
    assert.match(busy, /<fieldset[^>]*disabled/)
    assert.match(busy, /aria-busy="true"/)
    assert.equal(busy.includes(DISMISS_SAVE_ERROR), false)
  } finally {
    await vite.close()
  }
})
