import { loadConfig } from '../src/config.js'
import { createApp } from '../src/app.js'
import { silentLogger } from '../src/logger.js'
import { REWRITE_INSTRUCTION } from '../src/prompts.js'

/**
 * Fake Gemini client. Records every call; answers the query-rewrite call and the
 * answer call differently, like the real flow does.
 */
export function createFakeAi({ rewrite = 'capital of France', reply = 'Paris is the capital.', fail } = {}) {
  const calls = []
  return {
    calls,
    models: {
      async generateContent(args) {
        calls.push(args)
        if (fail) throw fail
        const isRewrite = args.config?.systemInstruction === REWRITE_INSTRUCTION
        const isSuggestions = args.config?.responseMimeType === 'application/json'
        if (isRewrite) return { text: rewrite }
        if (isSuggestions) {
          return {
            text: JSON.stringify([
              { icon: '💻', text: 'Write a haiku in Python' },
              { icon: '🧠', text: 'Explain recursion simply' },
              { icon: '📰', text: 'What happened in tech today?' },
              { icon: '🍳', text: 'Plan a quick weeknight dinner' },
            ]),
          }
        }
        return { text: reply }
      },
    },
  }
}

export function createFakeSearch(results = []) {
  return {
    searchWeb: async () => results,
    headlines: async () => [],
  }
}

/** Start the app on an ephemeral port. Returns { url, close, ai }. */
export async function startTestServer({ env = {}, ai = createFakeAi(), search = createFakeSearch() } = {}) {
  const config = loadConfig({ GEMINI_API_KEY: 'test-key', ...env })
  const app = createApp({ config, ai, search, logger: silentLogger })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const url = `http://127.0.0.1:${server.address().port}`
  return {
    url,
    ai,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

export const postJson = (url, body, init = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  })
