import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = 4182
const chromePort = 9334
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

const vite = await createServer({
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
    '--user-data-dir=/tmp/re-opportunities-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  const browser = await waitForBrowser()
  const shots = [
    ['blurred', 1280, 1500, 're-opportunities-blurred-1280.png'],
    ['blurred', 390, 844, 're-opportunities-blurred-390.png'],
    ['approved', 1280, 1500, 're-opportunities-approved-1280.png'],
    ['approved', 390, 844, 're-opportunities-approved-390.png'],
    ['demo', 1280, 1500, 're-opportunities-demo-1280.png'],
    ['demo', 390, 844, 're-opportunities-demo-390.png'],
  ]
  for (const [state, width, height, name] of shots) {
    await capture(browser, state, width, height, path.join(outDir, name))
  }
  await verifyFilters(browser)
  await verifyIntro(browser)
  await verifyMobileSheet(browser)
} finally {
  chrome.kill('SIGKILL')
  await vite.close()
}

async function waitForBrowser() {
  const started = Date.now()
  while (Date.now() - started < 15000) {
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

function pageUrl(state) {
  return `http://127.0.0.1:${port}/real-estate.html?state=${state}`
}

async function capture(browser, state, width, height, file) {
  void browser
  await withPage(width, height, pageUrl(state), async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const card = document.querySelector('[data-re-card]')
          const title = document.querySelector('h1')
          if (card && title && title.textContent.includes('Real Estate')) {
            document.fonts.ready.then(() => {
              const main = document.querySelector('.shell-main')
              if (main && window.innerWidth < 500) main.scrollTop = 0
              const blur = card.querySelector('.re-locked-copy')
              const open = card.textContent.includes('Intro approved for you.')
              const secret = card.innerText.includes('Nahla House Works')
              const forming = document.querySelector('[data-re-forming]')
              const tab = document.querySelector('[data-destination="Real Estate"]')
              resolve({
                ok: true,
                open,
                secret,
                forming: Boolean(forming),
                blur: Boolean(blur),
                tab: Boolean(tab),
                text: card.innerText.slice(0, 240),
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
    if (!value?.ok) throw new Error(`Real Estate smoke did not render ${state} at ${width}: ${JSON.stringify(value)}`)
    if (state === 'approved' && (!value.open || !value.secret)) throw new Error('approved card was not clear')
    if (state !== 'approved' && (value.open || value.secret)) throw new Error(`${state} card leaked or was clear`)
    if (state === 'demo' && !value.forming) throw new Error('demo state missing forming copy')
    if (state === 'blurred' && value.forming) throw new Error('live blurred state showed forming copy')
    if (!value.tab) throw new Error('Real Estate tab missing')
    if (state !== 'approved' && !value.blur) throw new Error('locked card missing blur')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}

async function verifyFilters(browser) {
  void browser
  await withPage(1280, 1500, pageUrl('blurred'), async (send) => {
    const result = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const chip = [...document.querySelectorAll('[aria-pressed]')].find((el) => el.textContent === 'Jeddah')
          if (!chip) {
            if (Date.now() - started > 8000) resolve({ ok: false, reason: 'no chip' })
            else setTimeout(tick, 50)
            return
          }
          chip.click()
          setTimeout(() => {
            const text = [...document.querySelectorAll('[data-re-card]')].map((el) => el.innerText).join('\n')
            resolve({
              ok: text.includes('Jeddah freight') && !text.includes('aimed at end users') && !text.includes('Red Sea'),
              text: text.slice(0, 400),
            })
          }, 80)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (!result.result?.value?.ok) {
      throw new Error(`city filter failed: ${JSON.stringify(result.result?.value)}`)
    }
    console.log('city filter ok')
  })
}

async function verifyIntro(browser) {
  void browser
  await withPage(1280, 1500, pageUrl('blurred'), async (send) => {
    const result = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const button = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Request intro')
          if (!button) {
            if (Date.now() - started > 8000) resolve({ ok: false, reason: 'no button' })
            else setTimeout(tick, 50)
            return
          }
          button.click()
          setTimeout(() => {
            const text = document.body.innerText
            resolve({
              ok: text.includes('Intro requested') && !text.includes('Nahla House Works'),
              text: text.slice(0, 300),
            })
          }, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (!result.result?.value?.ok) {
      throw new Error(`intro request failed: ${JSON.stringify(result.result?.value)}`)
    }
    console.log('intro request ok')
  })
}

async function verifyMobileSheet(browser) {
  void browser
  await withPage(390, 844, pageUrl('demo'), async (send) => {
    const result = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const button = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Filters')
          const tab = [...document.querySelectorAll('[data-destination="Real Estate"]')].length
          if (!button) {
            if (Date.now() - started > 8000) resolve({ ok: false, reason: 'no filters', tab })
            else setTimeout(tick, 50)
            return
          }
          button.click()
          setTimeout(() => {
            const sheet = document.getElementById('re-filter-sheet')
            const text = sheet ? sheet.innerText : ''
            resolve({
              ok: Boolean(sheet) && text.includes('Asset class') && text.includes('City') && text.includes('Capital role') && text.includes('industrial/logistics') && tab >= 1,
              tab,
              text: text.slice(0, 300),
            })
          }, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (!result.result?.value?.ok) {
      throw new Error(`mobile filters failed: ${JSON.stringify(result.result?.value)}`)
    }
    console.log('mobile filters ok')
  })
}
