import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'
import { loadConfig } from './src/config.js'
import { createLogger, describeError } from './src/logger.js'
import { createSearch } from './src/search.js'
import { createApp } from './src/app.js'

dotenv.config({ quiet: true })

const logger = createLogger({ level: process.env.LOG_LEVEL ?? 'info' })

let config
try {
  config = loadConfig()
} catch (error) {
  logger.error({ msg: error.message })
  process.exit(1) // fail fast: don't start a server that can't work
}

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey })
const search = createSearch({
  tavilyApiKey: config.tavilyApiKey,
  timeoutMs: config.limits.searchTimeoutMs,
  logger,
})
const app = createApp({ config, ai, search, logger })

const server = app.listen(config.port, () => {
  logger.info({
    msg: 'server started',
    port: config.port,
    env: config.nodeEnv,
    search: config.tavilyApiKey ? 'tavily' : 'wikipedia',
  })
})

// ---- graceful shutdown: stop accepting connections, let in-flight requests finish ----
function shutdown(signal) {
  logger.info({ msg: 'shutting down', signal })
  server.close((err) => process.exit(err ? 1 : 0))
  setTimeout(() => process.exit(1), 10_000).unref() // don't hang forever
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error({ msg: 'unhandled rejection', ...describeError(reason) })
})
