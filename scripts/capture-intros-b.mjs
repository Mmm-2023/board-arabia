import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const port = 4196
const chromePort = 9346
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const only = new Set(process.argv.slice(2))
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
    '--user-data-dir=/tmp/intros-b-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const shots = [
  ['home', 'intros-b-home-suggestions', 'Suggested introductions'],
  ['intros', 'intros-b-intros-suggestions', 'Both work on energy transition in Riyadh'],
  ['meet', 'intros-b-did-you-meet', 'Did you meet?'],
  ['funnel', 'intros-b-funnel-met', 'layla@example.com'],
]

try {
  await waitForBrowser()
  for (const [view, name, marker] of shots) {
    if (only.size && !only.has(view) && !only.has(name)) continue
    for (const width of [1280, 390]) {
      const height = width === 390 ? 1800 : 1400
      const file = path.join(outDir, `${name}-${width}.png`)
      await capture(`http://127.0.0.1:${port}/scripts/smoke/intros-b.html?view=${view}`, width, height, file, marker)
    }
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

async function capture(url, width, height, file, marker) {
  await withPage(width, height, url, async (send) => {
    const ready = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const text = document.body.textContent || ''
          const root = document.querySelector('[data-preview]')
          if (root && text.toLowerCase().includes(${JSON.stringify(marker.toLowerCase())})) {
            resolve({ ok: true, text })
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
    if (!ready.result?.value?.ok) {
      throw new Error(`${file} did not render: ${JSON.stringify(ready.result?.value)}`)
    }
    const fit = await send('Runtime.evaluate', {
      expression: `(() => {
        const width = window.innerWidth
        const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - width
        const targets = [...document.querySelectorAll('button, a')]
          .filter((node) => node.getClientRects().length)
          .map((node) => {
            const box = node.getBoundingClientRect()
            return { text: (node.textContent || '').trim().slice(0, 40), w: Math.round(box.width), h: Math.round(box.height) }
          })
          .filter((item) => item.h > 0 && item.h < 44 && item.w > 24)
        return { overflow, targets }
      })()`,
      returnByValue: true,
    })
    const check = fit.result?.value
    if (width === 390 && check?.overflow > 1) {
      throw new Error(`${file} overflows by ${check.overflow}px`)
    }
    if (width === 390 && check?.targets?.length) {
      throw new Error(`${file} targets under 44px: ${JSON.stringify(check.targets)}`)
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}
