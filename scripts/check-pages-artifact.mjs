/**
 * Pages artifact gate. Calendar hosts stay fully banned.
 * nammco is banned except the exact footer credit.
 */
import fs from 'node:fs'
import path from 'node:path'
import { strayPublicNammco } from './public-nammco.mjs'

const root = path.resolve(process.argv[2] || 'dist')
const hits = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    const text = fs.readFileSync(full).toString('latin1')
    if (strayPublicNammco(text)) hits.push(path.relative(root, full))
  }
}

if (!fs.existsSync(root)) {
  console.error(`missing artifact directory ${root}`)
  process.exit(1)
}

walk(root)
if (hits.length) {
  console.error('banned string in Pages artifact')
  for (const hit of hits) console.error(hit)
  process.exit(1)
}
