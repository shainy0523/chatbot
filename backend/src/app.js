import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import {
  REWRITE_INSTRUCTION,
  buildContents,
  buildSystemInstruction,
  validateChatBody,
} from './prompts.js'
import { describeError } from './logger.js'

const NO_LIVE_RESULTS_NOTICE =
  "\n\n⚠️ I couldn't fetch live web results for this, so this answer may be out of date."

/**
 * Build the Express app. Everything external (Gemini client, web search, logger)
 * is injected so the app can be tested without network access.
 */
export function createApp({ config, ai, search, logger }) {
  const { limits } = config
  const app = express()

  app.set('trust proxy', config.trustProxy)
  app.disable('x-powered-by')

  // ---- request id + access log (never logs message content) ----
  app.use((req, res, next) => {
    req.id = crypto.randomUUID()
    res.setHeader('X-Request-Id', req.id)
    const start = process.hrtime.bigint()
    res.on('finish', () => {
      logger.info({
        msg: 'request',
        id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
      })
    })
    next()
  })

  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: limits.bodyBytes }))

  // ---- health check (for load balancers / uptime monitors) ----
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) })
  })

  // ---- rate limiting: every chat costs real money, so cap per client ----
  const limiter = (limit, what) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({ error: `Too many ${what}. Please wait a minute and try again.` })
      },
    })

  app.use('/api', limiter(limits.apiPerMinute, 'requests'))

  // ---- Gemini with a hard timeout ----
  const generate = ({ contents, config: cfg }) =>
    ai.models.generateContent({
      model: config.model,
      contents,
      config: { ...cfg, abortSignal: AbortSignal.timeout(limits.geminiTimeoutMs) },
    })

  // Short, correctly spelled search query; null when no lookup is needed.
  async function buildSearchQuery(question, contents) {
    try {
      const r = await generate({
        contents,
        config: { systemInstruction: REWRITE_INSTRUCTION, temperature: 0 },
      })
      const q = (r.text ?? '').trim().replace(/^["']|["']$/g, '')
      return !q || /^none$/i.test(q) ? null : q.slice(0, 200)
    } catch (error) {
      logger.warn({ msg: 'query rewrite failed', ...describeError(error) })
      return question // fall back to the raw question
    }
  }

  // ---- POST /api/chat ----
  app.post('/api/chat', limiter(limits.chatPerMinute, 'messages'), async (req, res) => {
    const parsed = validateChatBody(req.body, limits)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    const { question, history } = parsed

    const contents = buildContents(history, question)
    const query = await buildSearchQuery(question, contents)
    const results = query ? await search.searchWeb(query) : []

    const response = await generate({
      contents,
      config: {
        systemInstruction: buildSystemInstruction({ today: new Date().toDateString(), results }),
      },
    })

    const text = (response.text ?? '').trim()
    if (!text) throw Object.assign(new Error('Empty response from model'), { status: 502 })

    res.json({
      reply: text + (!query || results.length ? '' : NO_LIVE_RESULTS_NOTICE),
      sources: results.map(({ title, url }) => ({ title, url })),
    })
  })

  // ---- GET /api/suggestions (cached, de-duplicated, cooldown on ?fresh=1) ----
  let cache = { at: 0, items: null }
  let inflight = null

  async function generateSuggestions() {
    const headlines = await search.headlines()
    const r = await generate({
      contents:
        `Today is ${new Date().toDateString()}. Write 4 short, varied conversation starters ` +
        'for a general-purpose AI chatbot: one coding task, one "explain this concept" question, ' +
        (headlines.length
          ? 'one question about a current event based on these headlines, '
          : 'one question about something recent or trending, ') +
        'and one practical or creative request. Each is under 60 characters, phrased as the user ' +
        'would type it. Give each a single fitting emoji.' +
        (headlines.length ? `\n\nHEADLINES:\n${headlines.map((h) => `- ${h}`).join('\n')}` : ''),
      config: {
        temperature: 1,
        responseMimeType: 'application/json',
        systemInstruction:
          'Reply with ONLY a JSON array of 4 objects shaped {"icon":"<emoji>","text":"<prompt>"}.',
      },
    })

    const parsed = JSON.parse(r.text ?? '[]')
    const items = (Array.isArray(parsed) ? parsed : [])
      .filter((s) => s && typeof s.text === 'string' && s.text.trim())
      .map((s) => ({
        icon: typeof s.icon === 'string' && s.icon.trim() ? s.icon.trim().slice(0, 8) : '💬',
        text: s.text.trim().slice(0, 80),
      }))
      .slice(0, 4)

    if (items.length < 2) throw new Error('Too few suggestions returned')
    return items
  }

  app.get('/api/suggestions', limiter(limits.suggestionsPerMinute, 'requests'), async (req, res) => {
    const age = Date.now() - cache.at
    // ?fresh=1 is honoured at most once per cooldown, so it can't be used to bypass the cache in a loop.
    const wantsFresh = req.query.fresh === '1' && age > limits.suggestionsFreshCooldownMs
    if (cache.items && age < limits.suggestionsTtlMs && !wantsFresh) {
      return res.json({ suggestions: cache.items })
    }

    try {
      inflight ??= generateSuggestions().finally(() => {
        inflight = null
      })
      const items = await inflight
      cache = { at: Date.now(), items }
      res.json({ suggestions: items })
    } catch (error) {
      logger.warn({ msg: 'suggestions failed', id: req.id, ...describeError(error) })
      if (cache.items) return res.json({ suggestions: cache.items }) // stale beats nothing
      res.status(502).json({ error: 'Unable to generate suggestions' })
    }
  })

  // ---- 404 + centralised error handling ----
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by their 4 arguments
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' })
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' })

    logger.error({ msg: 'request failed', id: req.id, path: req.path, ...describeError(err) })

    if (res.headersSent) return
    if (err.status === 429) {
      return res
        .status(429)
        .json({ error: 'The AI service is busy right now. Please wait a minute and try again.' })
    }
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'The AI took too long to respond. Please try again.' })
    }
    if (err.name === 'ApiError' || err.status === 502) {
      return res.status(502).json({ error: 'Unable to generate an AI response right now.' })
    }
    res.status(500).json({ error: 'Something went wrong on our side.' })
  })

  return app
}
