import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const port = 4184
const chromePort = 9345
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
  plugins: [
    {
      name: 'tr3-preview',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || ''
          if (!url.startsWith('/tr3')) return next()
          const html = await server.transformIndexHtml(
            url,
            `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Marketing preview</title>
    <script type="module" src="/src/shell/tr3Preview.tsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
          )
          res.setHeader('content-type', 'text/html; charset=utf-8')
          res.end(html)
        })
      },
    },
  ],
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
    '--user-data-dir=/tmp/tr3-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const shots = [
  ['marketing', 1280, 900, 'admin-marketing-1280.png', true, 'EXAMPLE DATA'],
  ['marketing', 390, 844, 'admin-marketing-390.png', false, 'EXAMPLE DATA'],
  ['empty', 1280, 900, 'admin-marketing-empty-1280.png', true, 'No site visits recorded yet'],
  ['home', 1280, 900, 'staff-home-card-1280.png', false, 'Marketing, last 7 days'],
  ['home', 390, 844, 'staff-home-card-390.png', false, 'OPEN MARKETING'],
  ['chip', 1280, 900, 'first-touch-chip.png', false, 'linkedin / social'],
]

try {
  await waitForBrowser()
  for (const [state, width, height, name, beyond, marker] of shots) {
    await capture(state, width, height, `${outDir}/${name}`, beyond, marker)
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

async function waitForMarker(send, marker) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < 15000) {
    let ready
    try {
      ready = await send('Runtime.evaluate', {
        expression: `(() => {
          const text = document.body ? document.body.innerText : ''
          return { ok: text.includes(${JSON.stringify(marker)}), text: text.slice(0, 800) }
        })()`,
        returnByValue: true,
      })
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
      await new Promise((resolve) => setTimeout(resolve, 100))
      continue
    }
    const value = ready.result?.value
    if (value?.ok) return value
    if (value?.text) last = value.text
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
  return { ok: false, text: last }
}

async function capture(state, width, height, file, beyond, marker) {
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/tr3?state=${state}` })
  const ready = await waitForMarker(send, marker)
  if (!ready.ok) throw new Error(`Preview was not ready for ${state} at ${width}: ${JSON.stringify(ready)}`)
  if (width === 390) {
    const overflow = await send('Runtime.evaluate', {
      expression: `(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))()`,
      returnByValue: true,
    })
    const value = overflow.result?.value
    if (!value || value.scroll > value.client + 1) {
      throw new Error(`Horizontal scroll at 390 for ${state}: ${JSON.stringify(value)}`)
    }
    const labels = await send('Runtime.evaluate', {
      expression: `(() => {
        const bars = [...document.querySelectorAll('nav[aria-label="Primary"]')]
        const bar = bars.find((node) => node.getClientRects().length > 0)
        if (!bar) return { error: 'no tab bar' }
        return {
          labels: [...bar.querySelectorAll('[data-nav="primary"], [data-nav="more"]')].map((link) => {
            const span = link.querySelector('span:last-of-type')
            const text = (span && span.textContent || link.getAttribute('aria-label') || '').trim()
            if (!span) return { text, truncated: false }
            const previous = span.style.fontWeight
            span.style.fontWeight = '700'
            const truncated = span.scrollWidth > span.clientWidth + 1
            span.style.fontWeight = previous
            return { text, truncated }
          }),
        }
      })()`,
      returnByValue: true,
    })
    const nav = labels.result?.value
    if (!nav || nav.error) throw new Error(`Tab bar missing at 390: ${JSON.stringify(nav)}`)
    const clipped = nav.labels.filter((item) => item.truncated)
    if (clipped.length) throw new Error(`Tab labels truncated at 390: ${JSON.stringify(clipped)}`)
  }
  if (beyond) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const style = document.createElement('style')
        style.textContent = 'html, body, .shell-root, .shell-frame, .shell-column, .shell-main { height: auto !important; max-height: none !important; overflow: visible !important; }'
        document.head.appendChild(style)
        return document.documentElement.scrollHeight
      })()`,
      returnByValue: true,
    })
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: beyond })
  const bytes = Buffer.from(shot.data, 'base64')
  writeFileSync(file, bytes)
  socket.close()
  await fetch(`http://127.0.0.1:${chromePort}/json/close/${tab.id}`)
  console.log(`${file} ${bytes.length}`)
}
