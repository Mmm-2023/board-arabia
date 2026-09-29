import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const port = 4191
const chromePort = 9341
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  configFile: path.resolve('vite.config.ts'),
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
})
await vite.listen()

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--disable-background-networking',
    '--no-first-run',
    `--remote-debugging-port=${chromePort}`,
    '--user-data-dir=/tmp/nav-review-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const views = [
  'home',
  'home-password',
  'home-example',
  'deals-mandates',
  'deals-real-estate',
  'deals-rooms',
  'rooms-new',
  'people-directory',
  'people-invites',
  'majlis',
  'ai',
  'account',
  'profile',
  'redirect',
]

try {
  await waitForBrowser()
  for (const view of views) {
    for (const width of [390, 1280]) {
      const height = width === 390 ? 844 : 800
      await capture(
        `http://127.0.0.1:${port}/scripts/smoke/nav-review.html?view=${view}`,
        width,
        height,
        path.join(outDir, `nav-${view}-${width}.png`),
        view,
      )
    }
  }
  const landingHeight = await measureLanding()
  console.log(`landing-390-height ${landingHeight}`)
  writeFileSync(path.join(outDir, 'landing-390-height.txt'), `${landingHeight}\n`)
} finally {
  chrome.kill('SIGKILL')
  await vite.close()
}

async function waitForBrowser() {
  const started = Date.now()
  while (Date.now() - started < 15000) {
    try {
      const res = await fetch(`http://127.0.0.1:${chromePort}/json/version`)
      if (res.ok) return
    } catch {
      // Chrome is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Chrome did not open a debugging port')
}

async function withPage(width, height, url, run) {
  const created = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent('about:blank')}`, {
    method: 'PUT',
  })
  const tab = await created.json()
  const socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 1
  const pending = new Map()
  let onLoad = () => {}
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Page.loadEventFired') onLoad()
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message || 'cdp error'))
    else resolve(message.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId
      nextId += 1
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500,
  })
  const loaded = new Promise((resolve) => {
    onLoad = resolve
  })
  await send('Page.navigate', { url })
  await loaded
  try {
    return await run(send)
  } finally {
    socket.close()
    await fetch(`http://127.0.0.1:${chromePort}/json/close/${tab.id}`)
  }
}

async function capture(url, width, height, file, view) {
  await withPage(width, height, url, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const root = document.querySelector('[data-preview]')
          const text = document.body.innerText || ''
          const ready = root && (text.includes('Home') || text.includes('Invites') || text.includes('Account'))
          if (ready) {
            const tiny = []
            const main = document.querySelector('.shell-main')
            if (main && ${width} < 500) {
              const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
              let node
              while ((node = walker.nextNode())) {
                const value = node.textContent.trim()
                if (!value) continue
                const el = node.parentElement
                if (!el || el.closest('[data-chip]')) continue
                const size = parseFloat(getComputedStyle(el).fontSize)
                if (size < 13) tiny.push(size + ' ' + value.slice(0, 40))
              }
            }
            const tabs = [...document.querySelectorAll('.shell-tab-bar [data-destination]')].map((el) => el.getAttribute('data-destination'))
            resolve({
              ok: true,
              text: text.slice(0, 240),
              tiny,
              tabs,
              account: text.includes('Sign out') && text.includes('Profile'),
              updated: text.includes('Updated '),
              network: /\\bNetwork\\b/.test(text),
            })
            return
          }
          if (Date.now() - started > 8000) resolve({ ok: false, text: text.slice(0, 240) })
          else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok) {
      throw new Error(`${view} at ${width} did not render: ${JSON.stringify(placed).slice(0, 800)}`)
    }
    if (width < 500 && value.tiny?.length) {
      console.log(`TINY ${view} ${value.tiny.slice(0, 8).join(' | ')}`)
    }
    if (value.updated) console.log(`UPDATED STAMP ${view} ${width}`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length} tabs=${(value.tabs || []).join(',')}`)
  })
}

async function measureLanding() {
  let height = 0
  await withPage(390, 844, `http://127.0.0.1:${port}/`, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const h1 = document.querySelector('h1')
          if (h1 && h1.textContent.trim()) {
            resolve({ ok: true, height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) })
            return
          }
          if (Date.now() - started > 8000) resolve({ ok: false, height: 0, text: document.body.innerText.slice(0, 120) })
          else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok) throw new Error(`landing did not render: ${JSON.stringify(value)}`)
    height = value.height
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: Math.min(value.height, 8000),
      deviceScaleFactor: 1,
      mobile: true,
    })
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(path.join(outDir, 'nav-landing-390.png'), Buffer.from(shot.data, 'base64'))
  })
  return height
}
