# ChatBot

An AI chat app with a web UI (React + Vite) and an Android app (React Native + Expo),
both talking to one small Express API. Answers come from Google Gemini and, when a
question needs fresh facts, are grounded with web search (Tavily, or Wikipedia as a free fallback).

```
┌────────────┐      ┌─────────────────┐      ┌───────────────────┐
│ Web (Vite) │─────▶│                 │─────▶│ Gemini            │
├────────────┤ HTTPS│  Express API    │      ├───────────────────┤
│ Android    │─────▶│  (backend/)     │─────▶│ Tavily / Wikipedia│
│ (Expo)     │      └─────────────────┘      └───────────────────┘
└────────────┘
```

| Folder | What it is |
|---|---|
| `src/` | Web app: Markdown replies, code blocks with copy, live suggestions, dark mode |
| `backend/` | API: `/api/chat`, `/api/suggestions`, `/healthz` |
| `mobile/` | Android app (Expo). See [mobile/.env.example](mobile/.env.example) |

## Quick start

Requires **Node 20+**.

```bash
# 1. backend
cd backend
cp .env.example .env        # then set GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm ci
npm run dev                 # http://localhost:5001

# 2. web app (new terminal, repo root)
npm ci
npm run dev                 # http://localhost:5173
```

After editing `backend/.env`, restart the backend. nodemon only reloads on `.js`/`.json` changes (type `rs`).

## Configuration

Set in `backend/.env` (see [backend/.env.example](backend/.env.example)). The server **refuses to start** if the config is invalid.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | *required* | Google AI Studio key |
| `TAVILY_API_KEY` | – | Better news/web search; Wikipedia is used when unset |
| `PORT` | `5001` | |
| `CORS_ORIGINS` | – | Deployed web app URL(s), comma-separated |
| `TRUST_PROXY` | `false` | Set `1` behind a reverse proxy so rate limits see real client IPs |
| `RATE_LIMIT_CHAT_PER_MIN` | `20` | Per-IP chat limit |
| `MAX_MESSAGE_CHARS` | `2000` | Longest accepted message |
| `GEMINI_TIMEOUT_MS` | `25000` | Hard timeout on every Gemini call |

Web app: `VITE_API_URL` (build-time) points at the deployed API, e.g. `https://my-api.example.com/api`.

## Scripts

| Command | What it does |
|---|---|
| `npm run check` | Lint + backend tests + production build (what CI runs) |
| `npm run lint` | ESLint for web app and backend |
| `npm test` | Backend tests (Node's built-in runner, no network, no API key needed) |
| `npm run build` | Production build of the web app into `dist/` |

## Deploying

**Backend**: a `Dockerfile` is included (non-root user, health check on `/healthz`):

```bash
docker build -t chatbot-backend backend
docker run -p 5001:5001 --env-file backend/.env -e NODE_ENV=production chatbot-backend
```

Or deploy `backend/` to any Node host (Render, Railway, Fly…) with `npm start`, set the
environment variables above, plus `TRUST_PROXY=1` and `CORS_ORIGINS=<your web URL>`.

**Web**: deploy the repo root to Vercel/Netlify (`npm run build`, output `dist`) with `VITE_API_URL` set.

**Android APK**: put the deployed API URL in `mobile/eas.json`, then
`cd mobile && npx eas-cli@latest build -p android --profile preview`.

## How it stays safe

- **Cost & abuse**: per-IP rate limits (chat, suggestions, whole API), message-length and body-size caps, and `?fresh=1` suggestions can't bypass the cache.
- **Prompt injection**: web search text is HTML-escaped and fenced as untrusted data in the prompt; roles in client-sent history are validated.
- **Reliability**: every Gemini and search call has a timeout; failures map to clean 4xx/5xx JSON without leaking upstream details; graceful shutdown on SIGTERM.
- **Privacy**: logs are structured JSON with request IDs and **never contain message text**.
- **Secrets**: only in environment variables; `.env` files are git-ignored.

### Known limitations

- No user accounts: limits are per IP. Add auth before opening this to the public at scale.
- Chat history lives in the browser/phone (`localStorage` / AsyncStorage) and is sent to the API with each message, so the server can't verify what the "assistant" said earlier.
- Messages are sent to Google (Gemini) and to Tavily/Wikipedia for search. Tell your users.
- 👍/👎 are stored locally only; replies aren't streamed (the typewriter effect is cosmetic).
- Math (`$…$`) isn't rendered in the Android app.
