import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

/** Chrome for browser tests. CHROME_PATH, then puppeteer's bundled browser. */
export function resolveChromePath(): string | null {
  const fromEnv = process.env.CHROME_PATH?.trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  try {
    const require = createRequire(import.meta.url)
    const puppeteer = require('puppeteer') as { executablePath?: () => string }
    const bundled = puppeteer.executablePath?.()
    if (bundled && existsSync(bundled)) return bundled
  } catch {
    return null
  }
  return null
}

export const CHROME_SKIP = 'Set CHROME_PATH or install puppeteer so its bundled browser can launch.'
