import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

test('desktop sidebar and mobile tabs share the locked destinations', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mod = (await vite.ssrLoadModule('/src/shell/renderShell.tsx')) as {
      renderMemberShell: () => string
      renderStaffShell: () => string
    }
    assertChrome(mod.renderMemberShell(), ['Home', 'Directory', 'Mandates', 'Network', 'Profile'], 'Switch to admin')
    assertChrome(mod.renderStaffShell(), ['Home', 'Applications', 'People', 'Capacity', 'Settings'], 'Switch to member')
    const sheet = mod.renderMemberShell(true)
    const more = sheet.slice(sheet.indexOf('id="shell-more"'))
    const order = ['AI Due Diligence', 'Majlis', 'Rooms', 'Help', 'Sign out']
    let cursor = 0
    for (const label of order) {
      const at = more.indexOf(label, cursor)
      assert.ok(at > cursor, `${label} should follow the previous More row`)
      cursor = at + label.length
    }
    for (const tab of ['Home', 'Directory', 'Mandates', 'Network', 'Profile']) {
      assert.equal(more.includes(`data-destination="${tab}"`), false, tab)
    }
    assert.match(sheet, /min-h-11 min-w-11/)
    assert.match(sheet, /aria-label="More"/)
    assert.match(sheet, /data-nav="sign-out"/)
    assert.match(sheet, /md:hidden/)
    assert.match(sheet, /hidden min-h-11 items-center px-2[^"]*md:inline-flex/)
  } finally {
    await vite.close()
  }
})

function assertChrome(html: string, labels: string[], roleSwitch: string) {
  for (const label of labels) {
    const hits = html.split(`data-destination="${label}"`).length - 1
    assert.equal(hits, 2, `${label} should be in the sidebar and the tab bar`)
  }
  const firstNav = html.slice(html.indexOf('data-nav="primary"'))
  let cursor = 0
  for (const label of labels) {
    const at = firstNav.indexOf(`data-destination="${label}"`, cursor)
    assert.ok(at > cursor || cursor === 0, label)
    assert.ok(at >= 0, label)
    cursor = at + 1
  }
  assert.match(html, /aria-label="Primary"/)
  assert.match(html, /md:hidden/)
  assert.match(html, /md:flex/)
  assert.match(html, /shell-safe-top/)
  assert.match(html, /shell-safe-bottom/)
  assert.match(html, /shell-safe-left/)
  assert.match(html, new RegExp(roleSwitch))
  assert.match(html, /Sign out/)
  assert.match(html, /Updated /)
  assert.equal(html.includes('\u2014'), false)
  assert.equal(/calendar\.app\.google/i.test(html), false)
  assert.equal(/nammco/i.test(html), false)
  assert.equal((html.match(/data-nav="primary"/g) || []).length, labels.length * 2)
  assert.match(html, /favicon\.svg/)
  assert.match(html, /Founding membership/)
  assert.match(html, /font-serif/)
  assert.equal(html.includes('M11.1'), false)
}
