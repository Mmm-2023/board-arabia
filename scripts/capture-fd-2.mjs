/**
 * Shots of the Apply landing after the front door stubs.
 * Serves dist the way GitHub Pages serves a folder index.
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { stubHtml } from './write-fd-redirects.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const shotDir = path.join(root, 'handoff/ba-fd-2')
mkdirSync(shotDir, { recursive: true })

function startPages() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = decodeURIComponent(url.pathname)
    const rel = pathname.replace(/^\/+/, '')
    if (rel.split('/').includes('..')) {
      res.writeHead(400)
      res.end()
      return
    }
    const full = path.join(dist, rel)
    const inside = full === dist || full.startsWith(`${dist}${path.sep}`)
    const send = (status, file) => {
      const type = file.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : file.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : file.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : file.endsWith('.svg')
              ? 'image/svg+xml'
              : file.endsWith('.png')
                ? 'image/png'
                : 'application/octet-stream'
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      createReadStream(file).pipe(res)
    }
    if (!inside) {
      res.writeHead(400)
      res.end()
      return
    }
    if (rel && existsSync(full) && statSync(full).isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/${url.search}` })
        res.end()
        return
      }
      const index = path.join(full, 'index.html')
      if (existsSync(index)) {
        send(200, index)
        return
      }
    }
    if (rel && existsSync(full) && statSync(full).isFile()) {
      send(200, full)
      return
    }
    const nested = path.join(dist, rel, 'index.html')
    if (existsSync(nested)) {
      send(200, nested)
      return
    }
    send(404, path.join(dist, '404.html'))
  })
}

function directTextUnder() {
  return (min) => {
    const rows = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
      const parent = node.parentElement
      if (text && parent) {
        const style = getComputedStyle(parent)
        const size = parseFloat(style.fontSize)
        const rect = parent.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0 && size < min) {
          rows.push({ size, text: text.slice(0, 90), tag: parent.tagName })
        }
      }
      node = walker.nextNode()
    }
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    const dashes = (document.body.innerText || '').match(/[\u2013\u2014]/g) || []
    return { rows, overflow, dashes: dashes.length, min }
  }
}

const server = startPages()
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const origin = `http://127.0.0.1:${port}`
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const sizes = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
]

try {
  const page = await browser.newPage()
  page.setDefaultTimeout(20000)
  await page.emulateMedia({ reducedMotion: 'reduce' })

  const shots = [
    { file: 'register-invite', url: '/register?invite=x', wait: 'This invite link is invalid' },
    { file: 'book', url: '/book', wait: 'Request consideration for Board Arabia' },
  ]
  for (const shot of shots) {
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto(`${origin}${shot.url}`, { waitUntil: 'networkidle' })
      await page.getByText(shot.wait).first().waitFor()
      const report = await page.evaluate(directTextUnder(15), 15)
      console.log(shot.file, size.name, page.url(), JSON.stringify({
        overflow: report.overflow,
        dashes: report.dashes,
        under15: report.rows.slice(0, 12),
        under15count: report.rows.length,
      }))
      await page.screenshot({ path: path.join(shotDir, `${shot.file}-${size.name}.png`), fullPage: true })
    }
  }

  const stub = await browser.newPage()
  await stub.emulateMedia({ reducedMotion: 'reduce' })
  const held = stubHtml()
    .replace(/<script>[\s\S]*?<\/script>/, '')
    .replace(/<meta http-equiv="refresh"[^>]*>/, '')
  for (const size of sizes) {
    await stub.setViewportSize({ width: size.width, height: size.height })
    await stub.setContent(held, { waitUntil: 'load' })
    const report = await stub.evaluate(directTextUnder(15), 15)
    const link = await stub.locator('a').evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return { w: rect.width, h: rect.height, size: parseFloat(style.fontSize), text: node.textContent }
    })
    const body = await stub.locator('p').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
    console.log('stub', size.name, JSON.stringify({ body, link, under15: report.rows, overflow: report.overflow, dashes: report.dashes }))
    await stub.screenshot({ path: path.join(shotDir, `stub-${size.name}.png`), fullPage: true })
  }
} finally {
  await browser.close()
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}
