import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const port = 4193
const chromePort = 9343
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
    '--user-data-dir=/tmp/account-review-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const shots = [
  ['register', 1280, 900],
  ['register', 390, 844],
  ['verify', 1280, 900],
  ['verify', 390, 844],
  ['home', 1280, 900],
  ['home', 390, 844],
  ['locked', 1280, 900],
  ['locked', 390, 844],
  ['account', 1280, 900],
  ['account', 390, 844],
]

try {
  await waitForBrowser()
  for (const [view, width, height] of shots) {
    await capture(
      `http://127.0.0.1:${port}/scripts/smoke/account-review.html?view=${view}`,
      width,
      height,
      path.join(outDir, `account-${view}-${width}.png`),
      view,
    )
  }
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
          const screen = document.querySelector('[data-screen]')
          const text = document.body.innerText || ''
          if (screen && text.trim()) {
            resolve({
              ok: true,
              screen: screen.getAttribute('data-screen'),
              basic: /\\bBasic\\b/.test(text),
              height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
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
    if (!value?.ok) throw new Error(`${view} at ${width} did not render: ${JSON.stringify(placed).slice(0, 500)}`)
    if (value.basic) throw new Error(`${view} at ${width} shows the word Basic`)
    const shotHeight = Math.min(Math.max(value.height, height), 4000)
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: shotHeight,
      deviceScaleFactor: 1,
      mobile: width < 500,
    })
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length} screen=${value.screen} h=${shotHeight}`)
  })
}
