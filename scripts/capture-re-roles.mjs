import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = 4192
const chromePort = 9352
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
    '--user-data-dir=/tmp/re-roles-chrome',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

try {
  await waitForBrowser()
  await capture('list', 1280, 1680, 're-roles-list-1280.png')
  await capture('list', 390, 1680, 're-roles-list-390.png')
  await capture('empty', 1280, 1100, 're-roles-empty-1280.png')
  await capture('empty', 390, 1100, 're-roles-empty-390.png')
  await capture('clear', 1280, 1400, 're-roles-clear-1280.png')
  await capture('clear', 390, 1400, 're-roles-clear-390.png')
  await capture('blurred', 1280, 1400, 're-roles-blurred-1280.png')
  await capture('blurred', 390, 1400, 're-roles-blurred-390.png')
  await capture('intro', 1280, 1400, 're-roles-intro-1280.png', true)
  await capture('intro', 390, 1400, 're-roles-intro-390.png', true)
  await captureStaff(1280, 1100, 're-roles-staff-1280.png')
  await captureStaff(390, 1200, 're-roles-staff-390.png')
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

function badMail(text) {
  const found = text.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
  return found.filter((mail) => !mail.toLowerCase().endsWith('@example.com'))
}

async function capture(state, width, height, name, clickIntro = false) {
  const pageState = clickIntro ? 'blurred' : state
  const url = `http://127.0.0.1:${port}/re-roles.html?state=${pageState}`
  await withPage(width, height, url, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const title = document.querySelector('h1')
          const panel = document.querySelector('[data-re-panel="roles"]')
          if (title && title.textContent.includes('Real estate') && panel) {
            document.fonts.ready.then(() => {
              const main = document.querySelector('.shell-main')
              const card = document.querySelector('[data-re-role]')
              const empty = document.querySelector('[data-re-roles-empty]')
              const target = card || empty
              if (main && target) {
                const delta = target.getBoundingClientRect().top - main.getBoundingClientRect().top
                main.scrollTop += Math.max(0, delta - 12)
              }
              const finish = () => {
                const text = document.body.innerText
                const selected = document.querySelector('[data-re-tab="roles"]')
                resolve({
                  ok: true,
                  selected: selected?.getAttribute('aria-selected') === 'true',
                  roles: (document.querySelectorAll('[data-re-role]').length),
                  blur: Boolean(document.querySelector('.re-locked-copy')),
                  open: Boolean(document.querySelector('[data-re-role-open]')),
                  confirm: Boolean(document.querySelector('[data-re-role-confirm="true"]')),
                  empty: Boolean(document.querySelector('[data-re-roles-empty]')),
                  example: /example/i.test(text),
                  org: text.includes('Safa Court Developer') || text.includes('Hadi Shore Hold'),
                  request: /request intro/i.test(text),
                  forming: Boolean(document.querySelector('[data-re-role-forming]')),
                  action: /see opportunities/i.test(text),
                  badMail: ${badMail.toString()}(text),
                  text: text.slice(0, 500),
                })
              }
              if (${clickIntro ? 'true' : 'false'}) {
                const button = [...document.querySelectorAll('[data-re-role] button')].find((el) => el.textContent.trim() === 'Request intro' && !el.disabled)
                if (!button) {
                  resolve({ ok: false, reason: 'no request button', text: document.body.innerText.slice(0, 300) })
                  return
                }
                button.click()
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
    if (!value?.ok) throw new Error(`${name} failed: ${JSON.stringify(value)}`)
    if (!value.selected) throw new Error(`${name} tab not selected`)
    if (value.badMail?.length) throw new Error(`${name} leaked mail: ${JSON.stringify(value.badMail)}`)
    if (state === 'list' && (value.roles < 3 || !value.blur || !value.example || !value.forming || value.org || value.open)) {
      throw new Error(`${name} list mismatch: ${JSON.stringify(value)}`)
    }
    if (state === 'empty' && (!value.empty || !value.action || value.roles !== 0)) {
      throw new Error(`${name} empty mismatch: ${JSON.stringify(value)}`)
    }
    if (state === 'clear' && (!value.open || !value.org || value.blur)) {
      throw new Error(`${name} clear mismatch: ${JSON.stringify(value)}`)
    }
    if (state === 'blurred' && (!value.blur || value.org || value.open || !value.request)) {
      throw new Error(`${name} blurred mismatch: ${JSON.stringify(value)}`)
    }
    if (state === 'intro' && (!value.confirm || value.org || !value.blur)) {
      throw new Error(`${name} intro mismatch: ${JSON.stringify(value)}`)
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, name)
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(file, bytes)
    console.log(`${file} ${bytes.length}`)
  })
}

async function captureStaff(width, height, name) {
  await withPage(width, height, `http://127.0.0.1:${port}/re-roles-staff.html`, async (send) => {
    const placed = await send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          const node = document.querySelector('[data-re-role-queue]')
          const home = document.querySelector('[data-destination="Home"]')
          if (node && home) {
            document.fonts.ready.then(() => {
              const text = document.body.innerText
              const mails = text.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g) || []
              resolve({
                ok: text.includes('Safa Court Developer') && /board role intros/i.test(text) && /approve intro/i.test(text) && text.includes('Layla N.'),
                mail: mails.length > 0,
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
