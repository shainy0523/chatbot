import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('refuses to start without GEMINI_API_KEY', () => {
  assert.throws(() => loadConfig({}), /GEMINI_API_KEY is required/)
  assert.throws(() => loadConfig({ GEMINI_API_KEY: '   ' }), /GEMINI_API_KEY is required/)
})

test('rejects invalid numeric settings instead of ignoring them', () => {
  assert.throws(() => loadConfig({ GEMINI_API_KEY: 'k', PORT: 'abc' }), /PORT must be/)
  assert.throws(() => loadConfig({ GEMINI_API_KEY: 'k', RATE_LIMIT_CHAT_PER_MIN: '0' }), /RATE_LIMIT_CHAT_PER_MIN/)
})

test('applies defaults and parses CORS origins', () => {
  const c = loadConfig({
    GEMINI_API_KEY: 'k',
    CORS_ORIGINS: 'https://app.example.com/, https://other.example.com',
  })
  assert.equal(c.port, 5001)
  assert.equal(c.tavilyApiKey, null)
  assert.ok(c.corsOrigins.includes('https://app.example.com')) // trailing slash trimmed
  assert.ok(c.corsOrigins.includes('http://localhost:5173'))
  assert.equal(c.trustProxy, false)
})

test('parses TRUST_PROXY', () => {
  assert.equal(loadConfig({ GEMINI_API_KEY: 'k', TRUST_PROXY: '1' }).trustProxy, 1)
  assert.equal(loadConfig({ GEMINI_API_KEY: 'k', TRUST_PROXY: 'true' }).trustProxy, true)
})
