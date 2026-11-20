import { describeError } from './logger.js'

const HEADERS = { 'User-Agent': 'my-chatbot/1.0' }

// Tavily: better web/news search. Free tier at https://tavily.com
async function searchTavily(query, { apiKey, timeoutMs }) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`Tavily ${r.status}`)
  const data = await r.json()
  return (data.results ?? []).map((x) => ({
    title: x.title,
    url: x.url,
    content: (x.content ?? '').slice(0, 1500),
  }))
}

// Wikipedia: free, no API key needed
async function wikipediaApi(params, timeoutMs) {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?${new URLSearchParams(params)}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`Wikipedia ${r.status}`)
  return r.json()
}

async function searchWikipedia(query, { timeoutMs }) {
  const data = await wikipediaApi(
    {
      action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '4',
      prop: 'extracts|info', exintro: '1', explaintext: '1', inprop: 'url',
      redirects: '1', format: 'json',
    },
    timeoutMs,
  )
  const pages = Object.values(data.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.extract)
    .map((p) => ({ pageid: p.pageid, title: p.title, url: p.fullurl, content: p.extract.slice(0, 1500) }))

  // The intro often omits current facts, so pull the full text of the best matches.
  await Promise.all(
    pages.slice(0, 2).map(async (page) => {
      try {
        const full = await wikipediaApi(
          { action: 'query', pageids: String(page.pageid), prop: 'extracts', explaintext: '1', format: 'json' },
          timeoutMs,
        )
        const text = Object.values(full.query?.pages ?? {})[0]?.extract
        if (text) page.content = text.slice(0, 6000)
      } catch {
        /* keep the intro */
      }
    }),
  )

  return pages.map(({ title, url, content }) => ({ title, url, content }))
}

export function createSearch({ tavilyApiKey, timeoutMs, logger }) {
  return {
    // Never throws: a failed search just means "no results".
    async searchWeb(query) {
      try {
        return tavilyApiKey
          ? await searchTavily(query, { apiKey: tavilyApiKey, timeoutMs })
          : await searchWikipedia(query, { timeoutMs })
      } catch (error) {
        logger.warn({ msg: 'web search failed', ...describeError(error) })
        return []
      }
    },

    // Headlines to ground the "current events" suggestion (needs Tavily).
    async headlines() {
      if (!tavilyApiKey) return []
      try {
        const results = await searchTavily('top news headlines today', { apiKey: tavilyApiKey, timeoutMs })
        return results.slice(0, 5).map((r) => r.title)
      } catch (error) {
        logger.warn({ msg: 'headline fetch failed', ...describeError(error) })
        return []
      }
    },
  }
}
