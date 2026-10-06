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
    const memberLabels = ['Home', 'Deals', 'People', 'Majlis', 'AI tools']
    assertMemberChrome(mod.renderMemberShell(), memberLabels)
    assertStaffChrome(mod.renderStaffShell())
    const staffMore = mod.renderStaffShell(true)
    const moreSheet = staffMore.slice(staffMore.indexOf('id="shell-more"'))
    for (const label of ['Review', 'Mandates', 'Rooms', 'AI tools', 'Access log', 'Marketing', 'Email', 'Capacity', 'Settings']) {
      assert.match(moreSheet, new RegExp(label.replace(' ', '\\s')))
    }
    assert.match(moreSheet, /data-destination="Review"/)
    const staffBar = tabBar(mod.renderStaffShell())
    assert.equal(staffBar.includes('data-destination="Review"'), false)
    assert.equal(staffBar.includes('data-destination="Capacity"'), false)
    assert.equal(staffBar.includes('>Capacity<'), false)
    const account = mod.renderMemberShell(true)
    assert.match(account, /id="shell-account"/)
    const sheet = account.slice(account.indexOf('id="shell-account"'))
    assert.match(sheet, /data-account-photo/)
    assert.match(sheet, /data-photo-size="44"/)
    assert.equal((account.match(/data-photo-size="36"/g) || []).length, 2)
    const closed = mod.renderMemberShell()
    assert.equal((closed.match(/data-photo-size="44"/g) || []).length, 0)
    assert.match(account, /aria-label="Account"/)
    assert.match(account, />Profile</)
    assert.match(account, />Help</)
    assert.match(account, /Switch to admin/)
    assert.match(account, /data-nav="sign-out"/)
    assert.equal(account.includes('aria-label="More"'), false)
    assert.equal(account.includes('Updated '), false)
    const home = mod.renderMemberShell()
    const bar = tabBar(home)
    assert.equal(bar.includes('data-nav="more"'), false)
    assert.match(bar, /grid-cols-5/)
    assert.equal((bar.match(/data-nav="primary"/g) || []).length, 5)
    assert.match(tabBar(mod.renderStaffShell()), /grid-cols-5/)
    assert.match(tabBar(mod.renderStaffShell()), /shell-staff-tabs/)
    assert.equal((tabBar(mod.renderStaffShell()).match(/data-nav="primary"/g) || []).length, 4)
    assert.match(tabBar(mod.renderStaffShell()), /data-destination="Majlis"/)
    assert.equal(header(home).includes('aria-label="More"'), false)
    assert.equal(header(home).includes('Sign out'), false)
    const ai = mod.renderMemberShell(false, '/dashboard/ai/due-diligence')
    assert.match(ai, /data-destination="AI tools"/)
    assert.match(header(ai), /AI tools/)
    const profile = mod.renderMemberShell(false, '/dashboard/profile')
    assert.match(header(profile), /Profile/)
    assert.match(profile, /ring-2/)
    const badge = mod.renderMemberShell(false, '/dashboard/deals/badge')
    assert.match(badge, /Deals, 2 invitations waiting/)
  } finally {
    await vite.close()
  }
})

function assertMemberChrome(html: string, labels: string[]) {
  for (const label of labels) {
    const hits = html.split(`data-destination="${label}"`).length - 1
    assert.equal(hits, 2, `${label} should be in the sidebar and the tab bar`)
  }
  assert.match(html, /aria-label="Primary"/)
  assert.match(html, /md:hidden/)
  assert.match(html, /md:flex/)
  assert.match(html, /shell-safe-top/)
  assert.match(html, /shell-safe-bottom/)
  assert.equal(html.includes('Updated '), false)
  assert.equal(html.includes('aria-label="More"'), false)
  assert.equal(html.includes('\u2014'), false)
  assert.equal((html.match(/data-nav="primary"/g) || []).length, labels.length * 2)
  assert.equal(html.includes('data-destination="Network"'), false)
}

function assertStaffChrome(html: string) {
  const sidebar = ['Home', 'Applications', 'Review', 'People', 'Majlis']
  const tabs = ['Home', 'Applications', 'People', 'Majlis']
  for (const label of sidebar) {
    assert.ok(html.includes(`data-destination="${label}"`), label)
  }
  for (const label of tabs) {
    assert.equal(html.split(`data-destination="${label}"`).length - 1, 2, label)
  }
  assert.equal(html.split('data-destination="Review"').length - 1, 1)
  const bar = tabBar(html)
  assert.equal((bar.match(/data-nav="primary"/g) || []).length, 4)
  assert.equal(bar.includes('data-destination="Review"'), false)
  assert.match(bar, /data-nav="more"/)
  assert.match(html, /Switch to member/)
  assert.match(html, /Sign out/)
  assert.equal(html.includes('\u2014'), false)
}

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
  assert.match(html, /ba-wordmark/)
  assert.match(html, /tracking-\[-0\.03em\]/)
  assert.equal(html.includes('font-serif'), false)
  assert.equal(html.includes('M11.1'), false)
  assert.match(tabBar(html), /data-nav="more"/)
  assert.equal(header(html).includes('aria-label="More"'), false)
}

function header(html: string) {
  const start = html.indexOf('<header')
  const end = html.indexOf('</header>')
  assert.ok(start >= 0 && end > start)
  return html.slice(start, end)
}

function tabBar(html: string) {
  const first = html.indexOf('aria-label="Primary"')
  const second = html.indexOf('aria-label="Primary"', first + 1)
  assert.ok(second > first)
  const sheet = html.indexOf('id="shell-more"')
  return html.slice(second, sheet === -1 ? html.length : sheet)
}
