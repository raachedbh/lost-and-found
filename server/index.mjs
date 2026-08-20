import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { createApp } from './app.mjs'

if (existsSync('.env')) loadEnvFile('.env')

const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production'
const port = Number(process.env.L9ITHA_PORT ?? (production ? 4173 : 8787))
const host = process.env.L9ITHA_HOST ?? '127.0.0.1'
const app = createApp({ production })
const server = createServer(app.handler)

server.listen(port, host, () => {
  console.log(`L9itha ${production ? 'app' : 'API'} ready at http://${host}:${port}`)
})

function shutdown() {
  server.close(() => {
    app.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
