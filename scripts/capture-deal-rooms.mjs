import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = 4183
const chromePort = 9335
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  configFile: false,
  root: path.resolve('scripts/smoke'),
  publicDir: path.resolve('public'),
  server: { host: '127.0.0.1', port, strictPort: true },
  plugins: [react(), tailwindcss()],
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
    '--user-data-dir=/tmp/deal-rooms-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  await waitForBrowser()
  const shots = [
    ['create', 1280, 1100, 'deal-rooms-create-1280.png'],
    ['create', 390, 1700, 'deal-rooms-create-390.png'],
    ['invite', 1280, 1400, 'deal-rooms-invite-1280.png'],
    ['invite', 390, 2600, 'deal-rooms-invite-390.png'],
    ['accept', 1280, 1100, 'deal-rooms-accept-1280.png'],
    ['accept', 390, 844, 'deal-rooms-accept-390.png'],
    ['manage', 1280, 1400, 'deal-rooms-manage-1280.png'],
    ['manage', 390, 2400, 'deal-rooms-manage-390.png'],
    ['staff', 1280, 1100, 'deal-rooms-staff-1280.png'],
  ]
  for (const [view, width, height, name] of shots) {
    await capture(view, width, height, path.join(outDir, name))
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
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
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
  await send('Page.navigate', { url })
  try {
    return await run(send)
  } finally {
    socket.close()
    await fetch(`http://127.0.0.1:${chromePort}/json/close/${tab.id}`)
  }
}

async function capture(view, width, height, file) {
  const url = `http://127.0.0.1:${port}/deal-rooms.html?view=${view}`
  await withPage(width, height, url, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const root = document.querySelector('[data-preview="${view}"]')
          const title = document.querySelector('h1')
          if (root && title && title.textContent.trim()) {
            document.fonts.ready.then(() => {
              const text = root.textContent || ''
              resolve({
                ok: true,
                title: title.textContent.trim(),
                accept: text.includes('Accept'),
                invite: text.includes('Hanan Al-Safi'),
                create: text.includes('Create room'),
                close: text.includes('Close room'),
                text: text.slice(0, 180),
              })
            })
            return
          }
          if (Date.now() - started > 8000) resolve({ ok: false, text: document.body.innerText.slice(0, 240) })
          else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok) throw new Error(`${view} at ${width} did not render: ${JSON.stringify(value)}`)
    if (view === 'accept' && !value.accept) throw new Error(`accept view missing Accept: ${value.text}`)
    if (view === 'invite' && !value.invite) throw new Error(`invite view missing directory result: ${value.text}`)
    if (view === 'create' && !value.create) throw new Error(`create view missing submit: ${value.text}`)
    if (view === 'manage' && !value.close) throw new Error(`manage view missing close: ${value.text}`)
    if (view === 'staff' && !value.close) throw new Error(`staff view missing close: ${value.text}`)
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length} ${value.title}`)
  })
}
