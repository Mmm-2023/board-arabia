import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const port = 4183
const chromePort = 9344
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
  plugins: [
    {
      name: 'tt2-preview',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || ''
          if (!url.startsWith('/tt2')) return next()
          const html = await server.transformIndexHtml(
            url,
            `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Membership preview</title>
    <script type="module" src="/src/shell/tt2Preview.tsx"></script>
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
    '--user-data-dir=/tmp/tt2-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const shots = [
  ['checklist', 1280, 900, 'checklist-meter-1280.png', true, 'Your path to full membership'],
  ['checklist', 390, 844, 'checklist-meter-390.png', false, 'Your path to full membership'],
  ['gate', 1280, 900, 'request-gate-1280.png', true, '7 of 7 required'],
  ['gate', 390, 844, 'request-gate-390.png', false, '7 of 7 required'],
  ['queue', 1280, 900, 'admin-queue-1280.png', true, 'Membership requests'],
  ['queue', 390, 844, 'admin-queue-390.png', false, 'Membership requests'],
  ['detail', 1280, 1100, 'admin-detail-1280.png', true, 'Review call'],
  ['detail', 390, 844, 'admin-detail-390.png', true, 'Review call'],
  ['approved', 1280, 900, 'member-approved-1280.png', false, 'Welcome to full membership'],
  ['approved', 390, 844, 'member-approved-390.png', false, 'Founding Member No. 7'],
  ['tabs', 390, 844, 'admin-tabs-390.png', false, 'Review'],
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/tt2?state=${state}` })
  const ready = await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const started = Date.now()
      const marker = ${JSON.stringify(marker)}
      const tick = () => {
        if (document.body.innerText.includes(marker)) {
          resolve({ ok: true })
          return
        }
        if (Date.now() - started > 8000) resolve({ ok: false, text: (document.body && document.body.innerText || '').slice(-800) })
        else setTimeout(tick, 50)
      }
      tick()
    })`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (!ready.result?.value?.ok) {
    throw new Error(`Preview was not ready for ${state} at ${width}: ${JSON.stringify(ready.result?.value)}`)
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
