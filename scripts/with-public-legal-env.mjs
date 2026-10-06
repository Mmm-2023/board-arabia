import { spawnSync } from 'node:child_process'
import { LEGAL_ENTITY_CR, LEGAL_ENTITY_LINE } from './public-nammco.mjs'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('missing command')
  process.exit(1)
}

const env = { ...process.env }
if (!String(env.VITE_LEGAL_BA_ENTITY || '').trim()) env.VITE_LEGAL_BA_ENTITY = LEGAL_ENTITY_LINE
if (!String(env.VITE_LEGAL_CR || '').trim()) env.VITE_LEGAL_CR = LEGAL_ENTITY_CR

const result = spawnSync(command, args, { stdio: 'inherit', env })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
