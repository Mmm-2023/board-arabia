import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const port = 4197
const chromePort = 9347
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
    '--user-data-dir=/tmp/sponsor-opt-in-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const shots = [
  ['off', 1280, 'sponsor-card-off-1280.png'],
  ['off', 390, 'sponsor-card-off-390.png'],
  ['on', 1280, 'sponsor-card-on-1280.png'],
  ['on', 390, 'sponsor-card-on-390.png'],
]

try {
  await waitForBrowser()
  for (const [card, width, name] of shots) {
    const height = width === 390 ? 844 : 900
    await capture(
      `http://127.0.0.1:${port}/scripts/smoke/sponsor-opt-in.html?card=${card}`,
      width,
      height,
      path.join(outDir, name),
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

async function capture(url, width, height, file) {
  await withPage(width, height, url, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const card = document.querySelector('[data-sponsor-card]')
          const text = document.body.innerText || ''
          if (card && text.includes('Show my card to sponsors')) {
            resolve({ ok: true, height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), text })
            return
          }
          if (Date.now() - started > 8000) resolve({ ok: false, text: text.slice(0, 400) })
          else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok) throw new Error(`${url} at ${width} did not render: ${JSON.stringify(placed).slice(0, 600)}`)
    if (/[A-Za-z0-9._%+-]+@(?!example\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(value.text)) {
      throw new Error('screenshot text has a non-example email')
    }
    const shotHeight = Math.min(Math.max(value.height, height), 2400)
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: shotHeight,
      deviceScaleFactor: 1,
      mobile: width < 500,
    })
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}
