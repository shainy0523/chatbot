import { useState, useEffect, useRef, useCallback } from 'react'
import Markdown, { CopyButton } from './Markdown'
import './App.css'

// set VITE_API_URL (e.g. https://my-backend.onrender.com/api) when deploying the web app
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'
const STORAGE_KEY = 'chat-messages-v2'
const THEME_KEY = 'chat-theme'

// shown only if the live suggestions can't be loaded
const FALLBACK_SUGGESTIONS = [
  { icon: '💻', text: 'Write a 5-star pyramid pattern in JavaScript' },
  { icon: '🧠', text: 'Explain closures in JavaScript with an example' },
  { icon: '🌐', text: "What's the latest news in AI?" },
  { icon: '✈️', text: 'Plan a 3-day trip to Tokyo' },
]

let nextId = Date.now()
const makeId = () => ++nextId

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/* Reveals a finished reply progressively so it feels like it is being written. */
function Typewriter({ text, onDone }) {
  const [count, setCount] = useState(0)
  const doneRef = useRef(onDone)

  useEffect(() => {
    doneRef.current = onDone
  })

  useEffect(() => {
    const step = Math.max(3, Math.ceil(text.length / 120))
    const id = setInterval(() => setCount((c) => Math.min(text.length, c + step)), 16)
    return () => clearInterval(id)
  }, [text])

  useEffect(() => {
    if (count >= text.length) doneRef.current?.()
  }, [count, text.length])

  return <Markdown>{text.slice(0, count)}</Markdown>
}

function Icon({ name }) {
  const common = {
    viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  }
  switch (name) {
    case 'refresh':
      return <svg {...common}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
    case 'up':
      return <svg {...common}><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
    case 'down':
      return <svg {...common}><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
    case 'sun':
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    case 'moon':
      return <svg {...common}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    case 'stop':
      return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
    case 'down-arrow':
      return <svg {...common}><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
    default:
      return null
  }
}

/* Live starter prompts from the backend, with a skeleton while loading and a static fallback. */
function Suggestions({ onPick }) {
  const [items, setItems] = useState(null) // null = loading
  const [isLive, setIsLive] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const url = `${API_BASE}/suggestions${refreshKey > 0 ? '?fresh=1' : ''}`

    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        setItems(data.suggestions)
        setIsLive(true)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setItems(FALLBACK_SUGGESTIONS)
        setIsLive(false)
      })

    return () => controller.abort()
  }, [refreshKey])

  function refresh() {
    setItems(null)
    setRefreshKey((k) => k + 1)
  }

  return (
    <>
      <div className="suggestions" aria-busy={items === null}>
        {items === null
          ? [0, 1, 2, 3].map((i) => <div key={i} className="suggestion skeleton" aria-hidden="true" />)
          : items.map((s) => (
              <button key={s.text} type="button" className="suggestion" onClick={() => onPick(s.text)}>
                <span className="suggestion-icon">{s.icon}</span>
                {s.text}
              </button>
            ))}
      </div>
      <button type="button" className="refresh-link" onClick={refresh} disabled={items === null}>
        <Icon name="refresh" />
        {isLive || items === null ? 'New ideas' : 'Try loading new ideas'}
      </button>
    </>
  )
}

function SparkAvatar() {
  return (
    <div className="avatar" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 2l2.1 6.4L20.5 10l-6.4 2.1L12 18.5l-2.1-6.4L3.5 10l6.4-2.1z" />
        <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" opacity=".7" />
      </svg>
    </div>
  )
}

function App() {
  const [messages, setMessages] = useState(loadMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false) // waiting on the server
  const [typingId, setTypingId] = useState(null) // id of the reply being "written"
  const [theme, setTheme] = useState(initialTheme)
  const [showJump, setShowJump] = useState(false)
  const [isUserTyping, setIsUserTyping] = useState(false) // you are typing right now

  const userTypingTimer = useRef(null)
  const scrollRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const stickRef = useRef(true)

  const isBusy = isLoading || typingId !== null
  const isEmpty = messages.length === 0

  /* ---------- persistence & theme ---------- */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)))
    } catch {
      /* storage unavailable */
    }
  }, [messages])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  /* ---------- scrolling ---------- */
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  function handleScroll() {
    const el = scrollRef.current
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickRef.current = nearBottom
    setShowJump(!nearBottom)
  }

  // follow new content (new messages, typing animation, images) while the user is at the bottom
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const ro = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom('auto')
    })
    ro.observe(list)
    return () => ro.disconnect()
  }, [scrollToBottom, isEmpty])

  /* ---------- "you are typing" indicator ---------- */
  const stopUserTyping = useCallback(() => {
    clearTimeout(userTypingTimer.current)
    setIsUserTyping(false)
  }, [])

  // clear the timer if the component unmounts
  useEffect(() => () => clearTimeout(userTypingTimer.current), [])

  /* ---------- talking to the backend ---------- */
  const requestReply = useCallback(async (base) => {
    const question = base[base.length - 1].text
    const history = base
      .slice(0, -1)
      .filter((m) => !m.error)
      .slice(-12)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }))

    const controller = new AbortController()
    abortRef.current = controller
    stickRef.current = true
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history }),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Something went wrong')

      const reply = {
        id: makeId(),
        role: 'bot',
        text: data.reply,
        sources: data.sources || [],
        time: Date.now(),
      }
      setMessages((prev) => [...prev, reply])
      setTypingId(reply.id)
    } catch (error) {
      if (error.name === 'AbortError') return
      console.error('Chat error:', error)
      const isNetwork = error instanceof TypeError
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'bot',
          error: true,
          text: isNetwork
            ? "I can't reach the server. Make sure the backend is running on port 5001, then try again."
            : error.message,
          time: Date.now(),
        },
      ])
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [])

  const send = useCallback(
    (raw) => {
      const text = raw.trim()
      if (!text || isBusy) return
      const next = [...messages, { id: makeId(), role: 'user', text, time: Date.now() }]
      setMessages(next)
      setInput('')
      stopUserTyping()
      requestReply(next)
    },
    [messages, isBusy, requestReply, stopUserTyping],
  )

  function regenerate() {
    if (isBusy) return
    const lastUser = messages.map((m) => m.role).lastIndexOf('user')
    if (lastUser === -1) return
    const base = messages.slice(0, lastUser + 1)
    setMessages(base)
    requestReply(base)
  }

  function stop() {
    abortRef.current?.abort() // cancel a pending request…
    setTypingId(null) // …or show the full reply immediately
  }

  function newChat() {
    abortRef.current?.abort()
    setTypingId(null)
    setIsLoading(false)
    setMessages([])
    setInput('')
    stopUserTyping()
    inputRef.current?.focus()
  }

  function setFeedback(id, value) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, feedback: m.feedback === value ? null : value } : m)),
    )
  }

  /* ---------- input ---------- */
  function resizeInput(el) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }

  function handleInputChange(e) {
    const value = e.target.value
    setInput(value)
    resizeInput(e.target)

    clearTimeout(userTypingTimer.current)
    if (!value.trim()) {
      setIsUserTyping(false)
      return
    }
    // "typing" while keys are being pressed; stops after 1.2s of no input
    stickRef.current = true
    setIsUserTyping(true)
    userTypingTimer.current = setTimeout(() => setIsUserTyping(false), 1200)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(input)
    }
  }

  // collapse the textarea after sending
  useEffect(() => {
    if (input === '' && inputRef.current) inputRef.current.style.height = 'auto'
  }, [input])

  // "/" focuses the input from anywhere
  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const lastBotId = [...messages].reverse().find((m) => m.role === 'bot')?.id
  const status = isLoading ? 'Thinking…' : typingId !== null ? 'Writing…' : 'Online'

  return (
    <div className="chat">
      <header className="chat-header">
        <SparkAvatar />
        <div className="header-text">
          <h1 className="chat-title">ChatBot</h1>
          <span className="chat-status">
            <span className={`status-dot ${isBusy ? 'busy' : ''}`} />
            {status}
          </span>
        </div>
        <div className="header-actions">
          <button type="button" className="icon-btn" onClick={newChat} title="New chat" aria-label="New chat">
            <Icon name="plus" />
            <span className="btn-label">New chat</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome-logo"><SparkAvatar /></div>
            <h2>How can I help you today?</h2>
            <p>Ask me anything — I can write code, explain ideas and search the web for fresh answers.</p>
            <Suggestions onPick={send} />
          </div>
        ) : (
          <div className="chat-messages" ref={listRef}>
            {messages.map((msg) => {
              const isTyping = msg.id === typingId
              return (
                <div key={msg.id} className={`row ${msg.role}`}>
                  {msg.role === 'bot' && <SparkAvatar />}
                  <div className="bubble-wrap">
                    <div className={`bubble ${msg.error ? 'error' : ''}`}>
                      {msg.role === 'user' ? (
                        <p className="user-text">{msg.text}</p>
                      ) : isTyping ? (
                        <Typewriter text={msg.text} onDone={() => setTypingId(null)} />
                      ) : (
                        <Markdown>{msg.text}</Markdown>
                      )}
                    </div>

                    {msg.sources?.length > 0 && !isTyping && (
                      <div className="sources">
                        <span className="sources-label">Sources</span>
                        {msg.sources.slice(0, 4).map((s, i) => (
                          <a key={i} className="source-chip" href={s.url} target="_blank" rel="noreferrer">
                            <span className="source-num">{i + 1}</span>
                            {s.title || new URL(s.url).hostname}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="meta">
                      <span className="time">{formatTime(msg.time)}</span>
                      {msg.role === 'bot' && !isTyping && (
                        <div className="actions">
                          {!msg.error && <CopyButton getText={() => msg.text} className="action" />}
                          {!msg.error && (
                            <>
                              <button
                                type="button"
                                className={`action ${msg.feedback === 'up' ? 'active' : ''}`}
                                onClick={() => setFeedback(msg.id, 'up')}
                                aria-label="Good response"
                                aria-pressed={msg.feedback === 'up'}
                              >
                                <Icon name="up" />
                              </button>
                              <button
                                type="button"
                                className={`action ${msg.feedback === 'down' ? 'active' : ''}`}
                                onClick={() => setFeedback(msg.id, 'down')}
                                aria-label="Bad response"
                                aria-pressed={msg.feedback === 'down'}
                              >
                                <Icon name="down" />
                              </button>
                            </>
                          )}
                          {msg.id === lastBotId && !isBusy && (
                            <button type="button" className="action" onClick={regenerate}>
                              <Icon name="refresh" />
                              {msg.error ? 'Retry' : 'Regenerate'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {isLoading && (
              <div className="row bot">
                <SparkAvatar />
                <div className="bubble typing" aria-label="Bot is thinking">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {isUserTyping && (
              <div className="row user">
                <div className="bubble-wrap">
                  <div className="bubble typing user-typing" aria-label="You are typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showJump && messages.length > 0 && (
        <button
          type="button"
          className="jump-btn"
          onClick={() => {
            stickRef.current = true
            scrollToBottom()
          }}
          aria-label="Scroll to latest message"
        >
          <Icon name="down-arrow" />
        </button>
      )}

      <div className="composer-wrap">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            autoFocus
            placeholder="Message ChatBot…"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            aria-label="Message"
          />
          {isBusy ? (
            <button type="button" className="send stop" onClick={stop} aria-label="Stop generating" title="Stop">
              <Icon name="stop" />
            </button>
          ) : (
            <button type="submit" className="send" disabled={!input.trim()} aria-label="Send" title="Send">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </form>
        <p className="hint">
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line · <kbd>/</kbd> to focus
        </p>
      </div>
    </div>
  )
}

export default App
