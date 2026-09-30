import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const port = 4179
const chromePort = 9334
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
  plugins: [
    {
      name: 'dd-memo-page',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || ''
          if (!url.startsWith('/dd-memo')) return next()
          const html = await server.transformIndexHtml(
            url,
            `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>AI Due Diligence memo</title>
    <script type="module" src="/src/shell/ddMemoPreview.tsx"></script>
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
    '--user-data-dir=/tmp/dd-memo-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  await waitForBrowser()
  const shots = [
    ['example', 1280, 900, 'dd-report-example-1280.png'],
    ['example', 390, 844, 'dd-report-example-390.png'],
    ['pass', 1280, 900, 'dd-report-pass-1280.png'],
    ['pass', 390, 844, 'dd-report-pass-390.png'],
    ['range', 1280, 900, 'dd-report-range-1280.png'],
    ['range', 390, 844, 'dd-report-range-390.png'],
    ['evidence', 1280, 900, 'dd-report-evidence-1280.png'],
    ['evidence', 390, 844, 'dd-report-evidence-390.png'],
    ['nosearch', 1280, 900, 'dd-report-public-checks-1280.png'],
    ['nosearch', 390, 844, 'dd-report-public-checks-390.png'],
  ]
  for (const [state, width, height, name] of shots) {
    await capture(state, width, height, `${outDir}/${name}`)
  }
} finally {
  chrome.kill('SIGKILL')
  await vite.close()
}

async function waitForBrowser() {
  const started = Date.now()
  while (Date.now() - started < 15_000) {
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

async function capture(state, width, height, file) {
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/dd-memo?state=${state}` })
  const ready = await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const started = Date.now()
      const tick = () => {
        const marker = new URLSearchParams(location.search).get('state') === 'example' ? 'Example Co' : 'Northwind Freight'
        if (document.querySelector('[data-dd-memo="true"]') && document.body.innerText.includes(marker)) {
          resolve({ ok: true })
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
  if (!ready.result?.value?.ok) {
    throw new Error(`Memo preview was not ready for ${state} at ${width}: ${JSON.stringify(ready.result?.value)}`)
  }
  await send('Runtime.evaluate', {
    expression: `(() => {
      const style = document.createElement('style')
      style.textContent = 'html, body, .shell-root, .shell-frame, .shell-column, .shell-main { height: auto !important; max-height: none !important; min-height: 0 !important; overflow: visible !important; margin-bottom: 0 !important; } body { padding-bottom: 4.5rem !important; }'
      document.head.appendChild(style)
      return document.documentElement.scrollHeight
    })()`,
    returnByValue: true,
  })
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const bytes = Buffer.from(shot.data, 'base64')
  writeFileSync(file, bytes)
  socket.close()
  await fetch(`http://127.0.0.1:${chromePort}/json/close/${tab.id}`)
  console.log(`${file} ${bytes.length}`)
}
