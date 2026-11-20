// All configuration comes from environment variables and is validated once at
// startup. The server refuses to boot on bad config instead of failing later
// with confusing upstream errors.

const DEFAULT_ORIGINS = [
  'http://localhost:5173', // Vite web app
  'http://localhost:8081', // Expo web preview of the mobile app
]

function intFromEnv(env, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}, errors) {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${name} must be an integer between ${min} and ${max} (got "${raw}")`)
    return fallback
  }
  return n
}

function parseTrustProxy(raw) {
  if (raw === undefined || raw === '' || raw === 'false') return false
  if (raw === 'true') return true
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : raw // number of hops, or an Express subnet string
}

export function loadConfig(env = process.env) {
  const errors = []

  const geminiApiKey = (env.GEMINI_API_KEY ?? '').trim()
  if (!geminiApiKey) errors.push('GEMINI_API_KEY is required (create one at https://aistudio.google.com/apikey)')

  const port = intFromEnv(env, 'PORT', 5001, { min: 1, max: 65535 }, errors)

  const corsOrigins = [
    ...DEFAULT_ORIGINS,
    ...(env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ]

  const limits = Object.freeze({
    bodyBytes: '64kb',
    maxMessageChars: intFromEnv(env, 'MAX_MESSAGE_CHARS', 2000, { min: 1 }, errors),
    maxHistoryItems: 12,
    maxHistoryItemChars: 4000,
    chatPerMinute: intFromEnv(env, 'RATE_LIMIT_CHAT_PER_MIN', 20, { min: 1 }, errors),
    suggestionsPerMinute: intFromEnv(env, 'RATE_LIMIT_SUGGESTIONS_PER_MIN', 10, { min: 1 }, errors),
    apiPerMinute: intFromEnv(env, 'RATE_LIMIT_API_PER_MIN', 120, { min: 1 }, errors),
    geminiTimeoutMs: intFromEnv(env, 'GEMINI_TIMEOUT_MS', 25_000, { min: 1000 }, errors),
    searchTimeoutMs: 8000,
    suggestionsTtlMs: 10 * 60 * 1000,
    suggestionsFreshCooldownMs: 30 * 1000,
  })

  if (errors.length) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`)
  }

  return Object.freeze({
    nodeEnv: env.NODE_ENV ?? 'development',
    port,
    geminiApiKey,
    tavilyApiKey: (env.TAVILY_API_KEY ?? '').trim() || null,
    model: env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    corsOrigins,
    // Set TRUST_PROXY=1 when running behind one reverse proxy (Render, Railway,
    // Fly, nginx...) so rate limiting sees real client IPs, not the proxy's.
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    limits,
  })
}
