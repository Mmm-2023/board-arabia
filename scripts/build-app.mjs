import { spawnSync } from 'node:child_process'

// The native shell is served from the app root. The Pages build script is separate.
const env = { ...process.env, VITE_BASE_PATH: '/' }

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
}

run(['scripts/with-public-legal-env.mjs', 'tsc', '-b'])
run(['scripts/with-public-legal-env.mjs', 'vite', 'build'])
