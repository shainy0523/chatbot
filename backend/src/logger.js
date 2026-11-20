// Minimal structured (JSON-lines) logger. One JSON object per line is what log
// platforms (Render, Datadog, CloudWatch...) expect. Never log message content:
// chats are private user data.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger({ level = 'info', write = (line) => process.stdout.write(line + '\n') } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info

  const log = (lvl) => (fields) => {
    if (LEVELS[lvl] < threshold) return
    write(JSON.stringify({ level: lvl, time: new Date().toISOString(), ...fields }))
  }

  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') }
}

export const silentLogger = { debug() {}, info() {}, warn() {}, error() {} }

// Safe summary of an error for logs: no stack, no request bodies, bounded size.
export function describeError(err) {
  return {
    name: err?.name,
    status: err?.status,
    message: String(err?.message ?? err).slice(0, 300),
  }
}
