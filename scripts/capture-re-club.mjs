import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = 4194
const chromePort = 9354
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
    '--user-data-dir=/tmp/re-club-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  await waitForBrowser()
  await captureMember('cta', 1280, 1500, 're-club-cta-1280.png')
  await captureMember('cta', 390, 1700, 're-club-cta-390.png')
  await captureMember('recorded', 1280, 1500, 're-club-recorded-1280.png')
  await captureMember('recorded', 390, 1700, 're-club-recorded-390.png')
  await captureStaff(1280, 1400, 're-club-staff-1280.png')
  await captureStaff(390, 1800, 're-club-staff-390.png')
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

async function captureMember(state, width, height, name) {
  await withPage(width, height, `http://127.0.0.1:${port}/re-club.html?state=${state}`, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const title = document.querySelector('h1')
          const card = document.querySelector('[data-re-card]')
          if (title && title.textContent.includes('Real estate') && card) {
            document.fonts.ready.then(() => {
              const text = document.body.innerText
              const express = document.querySelector('[data-re-club="express"]')
              const recorded = document.querySelector('[data-re-club="recorded"]')
              const sample = document.querySelector('[data-re-club="sample"]')
              resolve({
                ok: true,
                express: Boolean(express) && !express.disabled,
                recorded: Boolean(recorded),
                sample: Boolean(sample) && sample.disabled,
                example: /example/i.test(text),
                secret: text.includes('Nahla House Works'),
                mail: /@(?!example\\.com)/i.test(text) && /[A-Za-z0-9._+-]+@(?!example\\.com)/i.test(text),
                cta: /express interest to co-invest/i.test(text),
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
    if (!value?.ok) throw new Error(`${name} failed: ${JSON.stringify(value)}`)
    if (value.secret) throw new Error(`${name} leaked a counterparty`)
    if (state === 'cta' && (!value.express || !value.sample || !value.example || !value.cta || value.recorded)) {
      throw new Error(`${name} cta mismatch: ${JSON.stringify(value)}`)
    }
    if (state === 'recorded' && (!value.recorded || value.express || !value.sample)) {
      throw new Error(`${name} recorded mismatch: ${JSON.stringify(value)}`)
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, name)
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}

async function captureStaff(width, height, name) {
  await withPage(width, height, `http://127.0.0.1:${port}/re-club-staff.html`, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const node = document.querySelector('[data-re-club-staff]')
          if (node) {
            document.fonts.ready.then(() => {
              const text = document.body.innerText
              const mails = text.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g) || []
              resolve({
                ok: /club interest/i.test(text) && text.includes('Layla N.') && text.includes('Huda S.') && /create deal room/i.test(text) && /link deal room/i.test(text),
                mail: mails.filter((mail) => !mail.toLowerCase().endsWith('@example.com')),
                text: text.slice(0, 500),
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
    if (!value?.ok || (value.mail && value.mail.length)) throw new Error(`${name} failed: ${JSON.stringify(value)}`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, name)
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}
