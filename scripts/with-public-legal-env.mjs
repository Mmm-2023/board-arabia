import { spawnSync } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('missing command')
  process.exit(1)
}

const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
