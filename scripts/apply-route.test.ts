import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('apply stays the legacy form and register is the candidate form', () => {
  const app = read('src/App.tsx')
  const apply = read('src/pages/ApplyPage.tsx')
  const register = read('src/pages/RegisterPage.tsx')
  const submit = read('src/lib/supabase.ts')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.match(app, /path="\/register" element=\{<RegisterPage/)
  assert.match(apply, /submitApplication\(/)
  assert.match(apply, /readSubmitAttribution\(/)
  assert.equal(/registerCandidate|register-candidate/.test(apply), false)
  assert.match(register, /registerCandidate\(/)
  assert.equal(/submitApplication\(/.test(register), false)
  assert.match(submit, /\/submit-application/)
  const publicSurfaces = [
    'src/pages/LandingPage.tsx',
    'src/components/Nav.tsx',
    'src/components/Footer.tsx',
    'src/components/landing/StickyApply.tsx',
    'src/components/CtaBand.tsx',
  ]
  for (const file of publicSurfaces) {
    assert.equal(read(file).includes('"/register"'), false, file)
    assert.equal(read(file).includes("'/register'"), false, file)
  }
})

test('rendered apply form is the legacy application and register is the candidate form', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const applyMod = await vite.ssrLoadModule('/src/pages/ApplyPage.tsx')
    const registerMod = await vite.ssrLoadModule('/src/pages/RegisterPage.tsx')
    const applyHtml = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/apply'] }, createElement(applyMod.ApplyPage)),
    )
    const registerHtml = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/register'] }, createElement(registerMod.RegisterPage)),
    )
    assert.match(applyHtml, /Submit for consideration/)
    assert.match(applyHtml, /LinkedIn/)
    assert.match(applyHtml, /Turnover/)
    assert.equal(applyHtml.includes('Security check'), false)
    assert.equal(applyHtml.includes('register-candidate'), false)
    assert.match(registerHtml, /Register for consideration/)
    assert.match(registerHtml, /Security check|could not load/)
    assert.equal(registerHtml.includes('Submit for consideration'), false)
  } finally {
    await vite.close()
  }
})
