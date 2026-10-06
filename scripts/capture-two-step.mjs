import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const port = 4197
const chromePort = 9347
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const workflow = readFileSync('.github/workflows/pages.yml', 'utf8')
const urlLine = workflow.match(/VITE_SUPABASE_URL:\s+(\S+)/)
const keyLine = workflow.match(/VITE_SUPABASE_ANON_KEY:\s+(\S+)/)
if (!urlLine || !keyLine) throw new Error('public supabase env missing from the pages workflow')
process.env.VITE_SUPABASE_URL = urlLine[1]
process.env.VITE_SUPABASE_ANON_KEY = keyLine[1]
process.env.VITE_ANALYTICS_ENABLED = 'false'

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
    '--user-data-dir=/tmp/two-step-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const shots = [
  ['enrol', 1280, 900, 'two-step-enrol'],
  ['enrol', 390, 844, 'two-step-enrol'],
  ['challenge', 1280, 900, 'two-step-challenge'],
  ['challenge', 390, 844, 'two-step-challenge'],
  ['staff', 1280, 900, 'two-step-staff-enrol'],
  ['staff', 390, 844, 'two-step-staff-enrol'],
  ['prompt', 1280, 900, 'two-step-member-prompt'],
  ['prompt', 390, 844, 'two-step-member-prompt'],
  ['dd', 1280, 900, 'two-step-dd-share'],
  ['dd', 390, 844, 'two-step-dd-share'],
  ['ai', 1280, 900, 'two-step-ai-share'],
  ['ai', 390, 844, 'two-step-ai-share'],
  ['admin', 1280, 900, 'two-step-admin-counts'],
  ['admin', 390, 844, 'two-step-admin-counts'],
]

try {
  await waitForBrowser()
  for (const [view, width, height, name] of shots) {
    await capture(
      `http://127.0.0.1:${port}/scripts/smoke/two-step.html?view=${view}`,
      width,
      height,
      path.join(outDir, `${name}-${width}.png`),
      view === 'enrol' || view === 'staff',
    )
  }
  await capture(
    `http://127.0.0.1:${port}/apply`,
    1280,
    900,
    path.join(outDir, 'apply-cta-1280.png'),
    false,
  )
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

async function capture(url, width, height, file, blurSecrets) {
  await withPage(width, height, url, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const heading = document.querySelector('h1, h2')
          const text = document.body.innerText || ''
          if (heading && text.trim().length > 20) {
            const named = document.getElementById('who-runs-the-desk')
            if (named && named.parentElement) named.parentElement.style.display = 'none'
            if (${blurSecrets ? 'true' : 'false'}) {
              const style = document.createElement('style')
              style.textContent = '[data-mfa-qr],[data-mfa-key]{filter:blur(16px);}'
              document.head.appendChild(style)
            }
            resolve({ ok: true, height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) })
            return
          }
          if (Date.now() - started > 8000) resolve({ ok: false, text: text.slice(0, 300) })
          else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok) throw new Error(`${url} at ${width} did not render: ${JSON.stringify(placed).slice(0, 500)}`)
    const shotHeight = Math.min(Math.max(value.height, height), 2200)
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
