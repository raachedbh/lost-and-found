import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' }),
]

let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  children.forEach((child) => child.kill('SIGTERM'))
  setTimeout(() => process.exit(code), 100).unref()
}

children.forEach((child) => child.on('exit', (code, signal) => {
  if (!stopping && code !== 0) {
    console.error(`Development process stopped (${signal ?? code}).`)
    stop(code ?? 1)
  }
}))

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
