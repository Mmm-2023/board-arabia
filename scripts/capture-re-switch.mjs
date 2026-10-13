import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const phase = process.argv[2] === 'before' ? 'before' : 'after'
const port = 4197
const chromePort = 9351
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
process.env.VITE_ANALYTICS_ENABLED ||= 'false'

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
    '--user-data-dir=/tmp/re-switch-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const views = [
  { id: 'opportunities', query: '' },
  { id: 'partners', query: '?view=partners' },
  { id: 'roles', query: '?view=roles' },
]

try {
  await waitForBrowser()
  for (const view of views) {
    for (const width of [1280, 390]) {
      const height = width === 1280 ? 800 : 844
      const file = path.join(outDir, `re-switch-${phase}-${view.id}-${width}.png`)
      await capture(view, width, height, file)
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

async function capture(view, width, height, file) {
  const url = `http://127.0.0.1:${port}/re-switch.html${view.query}`
  await withPage(width, height, url, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const title = document.querySelector('h1')
          const panel = document.querySelector('[data-re-panel="${view.id}"]')
          const tabs = document.querySelector('[role="tablist"]')
          if (title && title.textContent.includes('Real estate') && panel && tabs) {
            document.fonts.ready.then(() => {
              const segment = document.querySelector('[data-re-segment]')
              const buttons = [...(segment || tabs).querySelectorAll('[role="tab"]')]
              const tops = buttons.map((el) => Math.round(el.getBoundingClientRect().top))
              const box = (segment || tabs).getBoundingClientRect()
              const section = document.querySelectorAll('[data-section-tabs]').length
              const text = document.body.innerText || ''
              resolve({
                ok: true,
                height: box.height,
                width: box.width,
                tops,
                oneLine: new Set(tops).size === 1,
                section,
                labels: buttons.map((el) => (el.textContent || '').trim()),
                selected: buttons.find((el) => el.getAttribute('aria-selected') === 'true')?.textContent?.trim() || '',
                panel: panel.getAttribute('data-re-panel'),
                desk: /\\bdesk\\b/i.test(text),
                sponsor: /\\bsponsor\\b/i.test(text),
              })
            })
            return
          }
          if (Date.now() - started > 8000) {
            resolve({ ok: false, text: (document.body.innerText || '').slice(0, 400) })
          } else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok) throw new Error(`${view.id} at ${width} did not render: ${JSON.stringify(placed).slice(0, 800)}`)
    if (value.desk || value.sponsor) {
      throw new Error(`${view.id} at ${width} leaked desk or sponsor: ${JSON.stringify(value)}`)
    }
    if (phase === 'after' && width === 390) {
      if (!value.oneLine) throw new Error(`segment wrapped at 390: ${JSON.stringify(value)}`)
      if (value.height > 56) throw new Error(`segment taller than one row: ${JSON.stringify(value)}`)
      if (value.section !== 1) throw new Error(`expected one section tab row: ${JSON.stringify(value)}`)
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(
      `${file} ${bytes.length} panel=${value.panel} selected=${value.selected} h=${value.height} line=${value.oneLine} labels=${value.labels.join('|')}`,
    )
  })
}
