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
    '--user-data-dir=/tmp/re-partners-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  await waitForBrowser()
  await captureMember('demo', 1280, 1400, path.join(outDir, 're-partners-demo-1280.png'))
  await captureMember('demo', 390, 844, path.join(outDir, 're-partners-demo-390.png'))
  await captureMember('intro', 1280, 1400, path.join(outDir, 're-partners-intro-1280.png'))
  await captureMember('intro', 390, 844, path.join(outDir, 're-partners-intro-390.png'))
  await captureStaff(1280, 1400, path.join(outDir, 're-partners-staff-1280.png'))
  await captureStaff(390, 844, path.join(outDir, 're-partners-staff-390.png'))
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

async function captureMember(mode, width, height, file) {
  await withPage(width, height, `http://127.0.0.1:${port}/partners.html`, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const mode = ${JSON.stringify(mode)}
        function placePartner() {
          if (window.innerWidth >= 500) return
          const main = document.querySelector('.shell-main')
          const target = document.querySelector('[data-re-partner-confirm="true"]') || document.querySelector('[data-re-partner] button')
          if (!main || !target) return
          const delta = target.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom
          if (delta > 0) main.scrollTop += delta + 16
        }
        const tick = () => {
          const card = document.querySelector('[data-re-partner]')
          const tab = document.querySelector('[data-re-tab="partners"]')
          const selected = tab && tab.getAttribute('aria-selected') === 'true'
          if (card && selected) {
            if (mode === 'intro') {
              const button = card.querySelector('button')
              if (!button) {
                if (Date.now() - started > 8000) resolve({ ok: false, reason: 'no request' })
                else setTimeout(tick, 50)
                return
              }
              button.click()
            }
            document.fonts.ready.then(() => {
              const confirm = document.querySelector('[data-re-partner-confirm="true"]')
              const text = document.body.innerText
              if (mode === 'intro' && !confirm) {
                if (Date.now() - started > 8000) resolve({ ok: false, reason: 'no confirm', text: text.slice(0, 300) })
                else setTimeout(() => {
                  const next = document.querySelector('[data-re-partner-confirm="true"]')
                  placePartner()
                  const body = document.body.innerText
                  resolve({
                    ok: Boolean(next) && body.toLowerCase().includes('intro requested') && !body.includes('@'),
                    groups: document.querySelectorAll('section[aria-label]').length,
                    text: body.slice(0, 500),
                  })
                }, 40)
                return
              }
              placePartner(mode)
              const lower = text.toLowerCase()
              resolve({
                ok: lower.includes('wahat title counsel') && lower.includes('law') && lower.includes('still forming') && !text.includes('@') && (mode === 'demo' ? lower.includes('request intro') : lower.includes('intro requested')),
                text: text.slice(0, 700),
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
    if (!value?.ok) throw new Error(`partners ${mode} failed at ${width}: ${JSON.stringify(value)}`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}

async function captureStaff(width, height, file) {
  await withPage(width, height, `http://127.0.0.1:${port}/partners-staff.html`, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const form = document.querySelector('[data-re-partner-edit]')
          const home = document.querySelector('[data-destination="Home"]')
          if (form && home) {
            document.fonts.ready.then(() => {
              document.documentElement.style.scrollBehavior = 'auto'
              const main = document.querySelector('.shell-main')
              if (main) main.style.scrollBehavior = 'auto'
              form.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
              const text = document.body.innerText
              const lower = text.toLowerCase()
              resolve({
                ok: lower.includes('safa court works') && lower.includes('save partner') && lower.includes('example firms stay as seeded') && lower.includes('sponsor') && !text.includes('@'),
                text: text.slice(0, 700),
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
    if (!value?.ok) throw new Error(`staff partners failed at ${width}: ${JSON.stringify(value)}`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}
