import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = 4188
const chromePort = 9344
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
    '--user-data-dir=/tmp/re-appetite-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  await waitForBrowser()
  await capture('empty', 1280, 1100, 're-appetite-empty-1280.png', '[data-re-appetite="empty"]')
  await capture('empty', 390, 1100, 're-appetite-empty-390.png', '[data-re-appetite="empty"]')
  await capture('filled', 1280, 1400, 're-appetite-filled-1280.png', '[data-re-appetite="filled"]')
  await capture('filled', 390, 1400, 're-appetite-filled-390.png', '[data-re-appetite="filled"]')
  await capture('filled', 1280, 1860, 're-appetite-fit-1280.png', '[data-re-fit="true"]', true)
  await captureStaff(1280, 900, 're-appetite-staff-1280.png')
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

async function capture(state, width, height, name, marker, pressFit = false) {
  const url = `http://127.0.0.1:${port}/re-appetite.html?state=${state === 'empty' ? 'empty' : 'filled'}`
  await withPage(width, height, url, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const node = document.querySelector(${JSON.stringify(marker)})
          const title = document.querySelector('h1')
          if (node && title && title.textContent.includes('Real estate')) {
            document.fonts.ready.then(() => {
              const main = document.querySelector('.shell-main')
              if (main) {
                const delta = node.getBoundingClientRect().top - main.getBoundingClientRect().top
                main.scrollTop += Math.max(0, delta - 16)
              }
              const finish = () => {
                const badge = document.querySelector('[data-re-fit="true"]')
                const text = document.body.innerText
                const cards = [...document.querySelectorAll('[data-re-card]')].map((el) => el.innerText)
                resolve({
                  ok: true,
                  empty: Boolean(document.querySelector('[data-re-appetite="empty"]')),
                  filled: Boolean(document.querySelector('[data-re-appetite="filled"]')),
                  fit: Boolean(document.querySelector('[data-re-fit="true"]')),
                  cards: cards.length,
                  redSea: cards.some((line) => line.includes('Red Sea')),
                  badgeBottom: badge ? badge.getBoundingClientRect().bottom : 0,
                  mail: text.includes('@'),
                  set: /set appetite/i.test(text),
                  edit: /edit appetite/i.test(text),
                  text: text.slice(0, 500),
                })
              }
              if (${pressFit ? 'true' : 'false'}) {
                const chip = [...document.querySelectorAll('button')].find((el) => {
                  if (el.textContent.trim().toLowerCase() !== 'fits your appetite') return false
                  const rect = el.getBoundingClientRect()
                  return rect.width > 0 && rect.height > 0 && el.getAttribute('aria-pressed') !== 'true'
                })
                if (chip) chip.click()
                setTimeout(finish, 80)
                return
              }
              finish()
            })
            return
          }
          if (Date.now() - started > 8000) resolve({ ok: false, text: document.body.innerText.slice(0, 300) })
          else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok || value.mail) throw new Error(`${name} failed: ${JSON.stringify(value)}`)
    if (state === 'empty' && (!value.empty || !value.set || value.fit)) throw new Error(`${name} empty mismatch: ${JSON.stringify(value)}`)
    if (state !== 'empty' && (!value.filled || !value.edit || !value.fit)) {
      throw new Error(`${name} filled mismatch: ${JSON.stringify(value)}`)
    }
    if (pressFit && (value.cards !== 1 || value.redSea || value.badgeBottom <= 0 || value.badgeBottom > height - 24)) {
      throw new Error(`${name} filter mismatch: ${JSON.stringify(value)}`)
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, name)
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}

async function captureStaff(width, height, name) {
  await withPage(width, height, `http://127.0.0.1:${port}/re-appetite-staff.html`, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const node = document.querySelector('[data-re-appetite-staff]')
          const home = document.querySelector('[data-destination="Home"]')
          if (node && home) {
            document.fonts.ready.then(() => {
              const text = document.body.innerText
              resolve({
                ok: text.includes('Layla N.') && /member re appetite/i.test(text) && text.includes('$10-25m'),
                mail: text.includes('@'),
                text: text.slice(0, 400),
              })
            })
            return
          }
          if (Date.now() - started > 8000) resolve({ ok: false, text: document.body.innerText.slice(0, 300) })
          else setTimeout(tick, 50)
        }
        tick()
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    const value = placed.result?.value
    if (!value?.ok || value.mail) throw new Error(`${name} failed: ${JSON.stringify(value)}`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, name)
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}
