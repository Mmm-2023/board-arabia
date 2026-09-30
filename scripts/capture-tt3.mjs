import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

if (!existsSync('.env')) copyFileSync('.env.example', '.env')

const port = 4184
const chromePort = 9345
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error',
  plugins: [
    {
      name: 'tt3-preview',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || ''
          if (!url.startsWith('/tt3')) return next()
          const html = await server.transformIndexHtml(
            url,
            `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>TT-3 preview</title>
    <script type="module" src="/src/shell/tt3Preview.tsx"></script>
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
    '--user-data-dir=/tmp/tt3-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const shots = [
  ['privacy', 1280, 900, 'privacy-notice-1280.png', 'How long we keep it', true],
  ['privacy', 390, 844, 'privacy-notice-390.png', 'How long we keep it', true],
  ['delete', 1280, 900, 'delete-account-1280.png', 'I understand this removes my account', false],
  ['delete', 390, 844, 'delete-account-390.png', 'I understand this removes my account', false],
  ['register', 1280, 900, 'register-disposable-error-1280.png', 'Disposable addresses are not accepted', true],
  ['register', 390, 844, 'register-disposable-error-390.png', 'Disposable addresses are not accepted', true],
  ['chips', 1280, 900, 'admin-review-chips-1280.png', 'Membership requests', false],
  ['chips', 390, 844, 'admin-review-chips-390.png', 'Membership requests', false],
]

try {
  await waitForBrowser()
  for (const [state, width, height, name, marker, beyond] of shots) {
    await capture(state, width, height, `${outDir}/${name}`, marker, beyond)
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

async function capture(state, width, height, file, marker, beyond) {
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/tt3?state=${state}` })
  const ready = await waitForMarker(send, marker)
  if (!ready.ok) throw new Error(`Preview was not ready for ${state} at ${width}: ${JSON.stringify(ready)}`)
  if (state === 'chips') {
    const check = await send('Runtime.evaluate', {
      expression: `(() => new Promise((resolve) => {
        const labels = ['Submitted', 'In review', 'Needs info', 'Review call', 'Waitlisted', 'Approved', 'Declined', 'Closed']
        const read = () => {
          const row = document.querySelector('.ba-state-chips')
          const options = [...document.querySelectorAll('[data-state-option]')]
          const texts = options.map((node) => (node.textContent || '').replace(/\\s+/g, ' ').trim())
          const rowBox = row ? row.getBoundingClientRect() : null
          const active = row ? row.querySelector('[aria-selected="true"]') : null
          const activeBox = active ? active.getBoundingClientRect() : null
          const card = document.querySelector('[data-screen="membership-queue"] a')
          const cardBox = card ? card.getBoundingClientRect() : null
          const bar = document.querySelector('nav[aria-label="Primary"]')
          const tabs = bar ? [...bar.querySelectorAll('[data-nav="primary"], [data-nav="more"]')].map((node) => (node.getAttribute('data-destination') || node.getAttribute('aria-label') || '').trim()) : []
          const activeInView = Boolean(rowBox && activeBox && activeBox.left >= rowBox.left - 1 && activeBox.right <= rowBox.right + 1)
          return {
            texts,
            rowHeight: rowBox ? rowBox.height : 0,
            cardGap: rowBox && cardBox ? cardBox.top - rowBox.bottom : 999,
            activeInView,
            tabs,
            barVisible: Boolean(bar && bar.getClientRects().length > 0),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        }
        let tries = 0
        const tick = () => {
          const value = read()
          if (value.activeInView || tries > 20) resolve(value)
          else {
            tries += 1
            setTimeout(tick, 50)
          }
        }
        tick()
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = check.result?.value
    if (!value) throw new Error(`Chip check failed at ${width}`)
    for (const label of ['Submitted', 'In review', 'Needs info', 'Review call', 'Waitlisted', 'Approved', 'Declined', 'Closed']) {
      if (!value.texts.some((text) => text.includes(label))) {
        throw new Error(`State ${label} is missing at ${width}: ${JSON.stringify(value.texts)}`)
      }
    }
    if (value.rowHeight > 56) {
      throw new Error(`Chip row is taller than one line at ${width}: ${value.rowHeight}`)
    }
    if (!value.activeInView) {
      throw new Error(`Active chip is not in view at ${width}: ${JSON.stringify(value)}`)
    }
    if (width === 390) {
      if (!value.barVisible || value.tabs.length !== 7) {
        throw new Error(`Staff bottom bar is not 7 items at 390: ${JSON.stringify(value.tabs)}`)
      }
      if (value.scrollWidth > value.clientWidth + 1) {
        throw new Error(`Horizontal overflow at 390: ${value.scrollWidth} > ${value.clientWidth}`)
      }
      if (value.cardGap > 220) {
        throw new Error(`First card is too far below the chips at 390: ${value.cardGap}`)
      }
    }
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

async function waitForMarker(send, marker) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < 15000) {
    let ready
    try {
      ready = await send('Runtime.evaluate', {
        expression: `(() => {
          const text = document.body ? document.body.innerText : ''
          return { ok: text.includes(${JSON.stringify(marker)}), text: text.slice(0, 500) }
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
