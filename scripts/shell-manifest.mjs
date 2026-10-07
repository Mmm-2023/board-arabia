/**
 * Fixed app shells for GitHub Pages.
 * Each path is a real route with no id segment. Share text is generic.
 * AI tool shells are derived from AI_TOOL_SLUGS so a new tool gets a shell.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strayPublicNammco } from './public-nammco.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const SHELL_SHARE = {
  member: {
    title: 'Board Arabia',
    description: 'A private Board Arabia members page. Sign in to open it.',
  },
  admin: {
    title: 'Board Arabia',
    description: 'A private Board Arabia page for our admin team.',
  },
  'public-utility': {
    title: 'Board Arabia',
    description: 'Board Arabia founding membership. Apply with your credentials for review.',
  },
}

/**
 * Paths that already had a shell, plus the fixed routes that were missing.
 * Sign-in and auth recovery use the member line. They are not the founding apply utility.
 * /dashboard/majlis/past uses the same member share line.
 */
const FIXED_SHELLS = [
  ['/login', 'member'],
  ['/login/staff', 'admin'],
  ['/admin', 'admin'],
  ['/admin/applications', 'admin'],
  ['/admin/review', 'admin'],
  ['/admin/people', 'admin'],
  ['/admin/people/intros', 'admin'],
  ['/admin/capacity', 'admin'],
  ['/admin/settings', 'admin'],
  ['/admin/email', 'admin'],
  ['/admin/majlis', 'admin'],
  ['/admin/mandates', 'admin'],
  ['/admin/rooms', 'admin'],
  ['/ops', 'admin'],
  ['/dashboard', 'member'],
  ['/dashboard/profile', 'member'],
  ['/dashboard/two-step', 'member'],
  ['/dashboard/directory', 'member'],
  ['/dashboard/mandates', 'member'],
  ['/dashboard/real-estate', 'member'],
  ['/dashboard/network', 'member'],
  ['/dashboard/help', 'member'],
  ['/dashboard/invites', 'member'],
  ['/dashboard/intros', 'member'],
  ['/dashboard/rooms', 'member'],
  ['/dashboard/rooms/new', 'member'],
  ['/dashboard/deals', 'member'],
  ['/dashboard/deals/mandates', 'member'],
  ['/dashboard/deals/real-estate', 'member'],
  ['/dashboard/deals/rooms', 'member'],
  ['/dashboard/deals/rooms/new', 'member'],
  ['/dashboard/people', 'member'],
  ['/dashboard/people/directory', 'member'],
  ['/dashboard/people/intros', 'member'],
  ['/dashboard/people/invites', 'member'],
  ['/dashboard/ai', 'member'],
  ['/dashboard/ai/due-diligence', 'member'],
  ['/dashboard/majlis', 'member'],
  ['/dashboard/majlis/past', 'member'],
  ['/dashboard/due-diligence', 'member'],
  ['/dashboard/events', 'member'],
  ['/auth/confirm', 'member'],
  ['/auth/reset', 'member'],
  ['/dashboard/profile/leave', 'member'],
  ['/dashboard/sponsorship', 'member'],
  ['/dashboard/partnership', 'member'],
  ['/dashboard/people/partners', 'member'],
  ['/dashboard/privacy', 'member'],
  ['/admin/ai', 'admin'],
  ['/admin/marketing', 'admin'],
  ['/admin/access', 'admin'],
  ['/register', 'public-utility'],
  ['/register/verify', 'public-utility'],
  ['/book', 'public-utility'],
  ['/verify', 'public-utility'],
  ['/apply/verify', 'public-utility'],
]

/** ID routes stay on the GitHub Pages 404 bounce. No query alias. */
export const ID_ROUTES_ON_404 = [
  '/dashboard/ai/due-diligence/:reportId',
  '/dashboard/ai/:toolSlug/:jobId',
  '/admin/mandates/:mandateId',
  '/admin/people/member/:memberId',
  '/dashboard/deals/rooms/:roomId',
  '/admin/review/:candidateId',
  '/dashboard/due-diligence/:reportId',
  '/dashboard/rooms/:roomId',
]

const OG_IMAGE = 'https://boardarabia.com/og-board-arabia.png'
const OG_ALT = 'Board Arabia stacked wordmark and Najdi diamond mark on Night Indigo'

export function readAiToolSlugs(source) {
  const text =
    source ??
    fs.readFileSync(path.join(root, 'supabase/functions/_shared/ai_tools.ts'), 'utf8')
  const match = text.match(/export const AI_TOOL_SLUGS\b[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!match) throw new Error('AI_TOOL_SLUGS was not found in ai_tools.ts')
  const slugs = []
  for (const line of match[1].split('\n')) {
    const hit = line.match(/^\s*[A-Za-z0-9_]+\s*:\s*'([a-z0-9-]+)'\s*,?\s*$/)
    if (hit) slugs.push(hit[1])
  }
  if (!slugs.length) throw new Error('AI_TOOL_SLUGS did not contain any slugs')
  return slugs
}

export function majlisPastDeclared(appSource) {
  return (
    appSource.includes('path="majlis/past"') ||
    appSource.includes('"/dashboard/majlis/past"') ||
    appSource.includes("'/dashboard/majlis/past'")
  )
}

function shellEntry(routePath, kind) {
  const share = SHELL_SHARE[kind]
  if (!share) throw new Error(`unknown shell kind ${kind}`)
  return {
    path: routePath,
    kind,
    title: share.title,
    description: share.description,
  }
}

export function appShells(options = {}) {
  const slugs = options.slugs ?? readAiToolSlugs(options.aiToolsSource)
  const rows = FIXED_SHELLS.map(([routePath, kind]) => shellEntry(routePath, kind))
  for (const slug of slugs) {
    rows.push(shellEntry(`/dashboard/ai/${slug}`, 'member'))
  }

  const seen = new Set()
  for (const entry of rows) {
    if (!entry.path.startsWith('/') || entry.path.length < 2 || entry.path.endsWith('/')) {
      throw new Error(`shell path must be absolute and have no trailing slash: ${entry.path}`)
    }
    if (entry.path.includes('..') || entry.path.includes(':')) {
      throw new Error(`shell path is not a fixed route: ${entry.path}`)
    }
    if (seen.has(entry.path)) throw new Error(`duplicate shell ${entry.path}`)
    seen.add(entry.path)
    if (entry.title !== 'Board Arabia') throw new Error(`${entry.path} share title`)
    if (entry.description.includes('\u2014')) throw new Error(`${entry.path} em dash in share text`)
    if (/nammco/i.test(entry.description) || entry.description.includes('7043252647')) {
      throw new Error(`${entry.path} banned share text`)
    }
  }
  return rows
}

export function escapeAttr(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

export function stripShareTags(html) {
  return html.replace(/\n?\s*<meta\s+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g, '')
}

/** Replace the home share tags on one app shell. Robots stay noindex, nofollow. */
export function shellDocument(shellHtml, entry) {
  const title = escapeAttr(entry.title)
  const description = escapeAttr(entry.description)
  let html = stripShareTags(shellHtml)
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${description}" />`,
  )
  const seo = [
    `<meta property="og:site_name" content="Board Arabia" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:alt" content="${escapeAttr(OG_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttr(OG_ALT)}" />`,
  ].join('\n    ')
  if (!html.includes('</head>')) throw new Error(`${entry.path} shell has no head`)
  return html.replace('</head>', `    ${seo}\n  </head>`)
}

export function shellArtifactPath(entry) {
  return `${entry.path.replace(/^\//, '')}/index.html`
}

export function shellProblems(html, entry, relativePath, { requireCsp = false } = {}) {
  const errors = []
  if (!html.includes('content="noindex, nofollow"')) errors.push('noindex')
  if (!html.includes(`property="og:title" content="${entry.title}"`)) errors.push('og:title')
  if (!html.includes(`name="twitter:title" content="${entry.title}"`)) errors.push('twitter:title')
  if (!html.includes(`property="og:description" content="${entry.description}"`)) errors.push('og:description')
  if (!html.includes(`name="twitter:description" content="${entry.description}"`)) errors.push('twitter:description')
  if ((html.match(/property="og:image"/g) || []).length !== 1) errors.push('og:image count')
  if (!html.includes(OG_IMAGE)) errors.push('og image')
  if (!html.includes('property="og:image:width" content="1200"')) errors.push('og width')
  if (!html.includes('property="og:image:height" content="630"')) errors.push('og height')
  if (!html.includes('property="og:image:type" content="image/png"')) errors.push('og type')
  if (!html.includes(OG_ALT)) errors.push('og alt')
  if (!html.includes('name="referrer" content="strict-origin-when-cross-origin"')) errors.push('referrer')
  if (html.includes('\u2014')) errors.push('em dash')
  if (requireCsp && !html.includes('http-equiv="Content-Security-Policy"')) errors.push('csp')
  if (requireCsp && /script-src[^;]*'unsafe-inline'/.test(html)) errors.push('unsafe-inline script')
  if (strayPublicNammco(html, relativePath)) errors.push('nammco')
  return errors
}
