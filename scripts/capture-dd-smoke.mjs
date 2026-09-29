import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'

const port = 4178
const chromePort = 9333
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
  plugins: [
    {
      name: 'dd-smoke-page',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || ''
          if (!url.startsWith('/dd-smoke')) return next()
          const html = await server.transformIndexHtml(
            url,
            `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>AI Due Diligence smoke</title>
    <script type="module" src="/src/shell/ddSmokePreview.tsx"></script>
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
    '--user-data-dir=/tmp/dd-smoke-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  const browser = await waitForBrowser()
  const shots = [
    ['running', 1280, 900, 'dd-running-1280.png'],
    ['running', 390, 844, 'dd-running-390.png'],
    ['error', 1280, 900, 'dd-error-1280.png'],
    ['error', 390, 844, 'dd-error-390.png'],
    ['retry', 1280, 900, 'dd-retry-1280.png'],
    ['retry', 390, 844, 'dd-retry-390.png'],
  ]
  for (const [state, width, height, name] of shots) {
    await capture(browser, state, width, height, `${outDir}/${name}`)
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
      if (res.ok) return res.json()
    } catch {
      // Chrome is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Chrome did not open a debugging port')
}

async function capture(browser, state, width, height, file) {
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/dd-smoke?state=${state}` })
  const placed = await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const started = Date.now()
      const tick = () => {
        const status = document.getElementById('dd-status')
        if (status && status.textContent.trim() && document.body.innerText.includes('AI Due Diligence')) {
          document.fonts.ready.then(() => {
            document.documentElement.style.scrollBehavior = 'auto'
            status.scrollIntoView({ block: 'center', behavior: 'instant' })
            const rect = status.getBoundingClientRect()
            const visible = rect.top >= 0 && rect.bottom <= window.innerHeight + 1
            resolve({ visible, top: rect.top, bottom: rect.bottom, height: window.innerHeight, text: status.innerText.slice(0, 180) })
          })
          return
        }
        if (Date.now() - started > 8000) resolve({ visible: false, text: document.body.innerText.slice(0, 180) })
        else setTimeout(tick, 50)
      }
      tick()
    })`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (!placed.result?.value?.visible) {
    throw new Error(`Smoke status was not in view for ${state} at ${width}: ${JSON.stringify(placed.result?.value)}`)
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const bytes = Buffer.from(shot.data, 'base64')
  await import('node:fs').then((fs) => fs.writeFileSync(file, bytes))
  socket.close()
  await fetch(`http://127.0.0.1:${chromePort}/json/close/${tab.id}`)
  console.log(`${file} ${bytes.length}`)
}
