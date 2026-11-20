import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { API_BASE, FALLBACK_SUGGESTIONS } from './src/config'
import { dark, light } from './src/theme'
import MarkdownView, { CopyButton } from './src/MarkdownView'

const STORAGE_KEY = 'chat-messages-v2'
const THEME_KEY = 'chat-theme'

let nextId = Date.now()
const makeId = () => ++nextId

const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/* ---------- small pieces ---------- */

function Avatar({ c, size = 34 }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.5 }}>✦</Text>
    </View>
  )
}

function TypingDots({ color }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current

  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(600 - i * 150),
        ]),
      ),
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [dots])

  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 4 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
          }}
        />
      ))}
    </View>
  )
}

/* Reveals a finished reply progressively so it feels like it is being written. */
function Typewriter({ text, c, onDone }) {
  const [count, setCount] = useState(0)
  const doneRef = useRef(onDone)

  useEffect(() => {
    doneRef.current = onDone
  })

  useEffect(() => {
    const step = Math.max(6, Math.ceil(text.length / 60))
    const id = setInterval(() => setCount((n) => Math.min(text.length, n + step)), 40)
    return () => clearInterval(id)
  }, [text])

  useEffect(() => {
    if (count >= text.length) doneRef.current?.()
  }, [count, text.length])

  return <MarkdownView c={c}>{text.slice(0, count)}</MarkdownView>
}

/* Live starter prompts from the backend, with a static fallback. */
function Suggestions({ c, onPick }) {
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

  return (
    <View style={{ width: '100%', gap: 10 }}>
      {items === null ? (
        <ActivityIndicator color={c.accent} style={{ marginVertical: 30 }} />
      ) : (
        items.map((s) => (
          <Pressable
            key={s.text}
            onPress={() => onPick(s.text)}
            style={({ pressed }) => [
              styles.suggestion,
              { backgroundColor: c.surface, borderColor: pressed ? c.accent : c.border },
            ]}
          >
            <Text style={{ fontSize: 20 }}>{s.icon}</Text>
            <Text style={{ flex: 1, color: c.text, fontSize: 15 }}>{s.text}</Text>
          </Pressable>
        ))
      )}
      <Pressable
        disabled={items === null}
        onPress={() => {
          setItems(null)
          setRefreshKey((k) => k + 1)
        }}
        style={{ alignSelf: 'center', padding: 10, opacity: items === null ? 0.5 : 1 }}
      >
        <Text style={{ color: c.muted, fontSize: 13 }}>
          ↻ {isLive || items === null ? 'New ideas' : 'Try loading new ideas'}
        </Text>
      </Pressable>
    </View>
  )
}

/* ---------- main screen ---------- */

function Chat() {
  const insets = useSafeAreaInsets()
  const systemScheme = useColorScheme()
  const [themeChoice, setThemeChoice] = useState(null) // null = follow the phone
  const scheme = themeChoice ?? systemScheme ?? 'light'
  const c = scheme === 'dark' ? dark : light

  const [messages, setMessages] = useState([])
  const [hydrated, setHydrated] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [typingId, setTypingId] = useState(null)
  const [isUserTyping, setIsUserTyping] = useState(false)

  const scrollRef = useRef(null)
  const stickRef = useRef(true)
  const abortRef = useRef(null)
  const userTypingTimer = useRef(null)

  const isBusy = isLoading || typingId !== null
  const isEmpty = messages.length === 0

  /* ---------- persistence ---------- */
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY, THEME_KEY])
      .then(([[, saved], [, theme]]) => {
        const parsed = saved ? JSON.parse(saved) : []
        if (Array.isArray(parsed)) setMessages(parsed)
        if (theme === 'light' || theme === 'dark') setThemeChoice(theme)
      })
      .catch(() => {})
      .finally(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100))).catch(() => {})
  }, [messages, hydrated])

  function toggleTheme() {
    const next = scheme === 'dark' ? 'light' : 'dark'
    setThemeChoice(next)
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {})
  }

  useEffect(() => () => clearTimeout(userTypingTimer.current), [])

  /* ---------- scrolling ---------- */
  function handleScroll(e) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
    stickRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80
  }

  /* ---------- talking to the backend ---------- */
  const stopUserTyping = useCallback(() => {
    clearTimeout(userTypingTimer.current)
    setIsUserTyping(false)
  }, [])

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

      const reply = { id: makeId(), role: 'bot', text: data.reply, sources: data.sources || [], time: Date.now() }
      setMessages((prev) => [...prev, reply])
      setTypingId(reply.id)
    } catch (error) {
      if (error.name === 'AbortError') return
      const isNetwork = error instanceof TypeError
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'bot',
          error: true,
          text: isNetwork
            ? "I can't reach the server. Check that the backend is running and your phone is on the same Wi-Fi."
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
    abortRef.current?.abort()
    setTypingId(null)
  }

  function newChat() {
    abortRef.current?.abort()
    setTypingId(null)
    setIsLoading(false)
    setMessages([])
    setInput('')
    stopUserTyping()
  }

  function setFeedback(id, value) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, feedback: m.feedback === value ? null : value } : m)),
    )
  }

  function handleChangeText(value) {
    setInput(value)
    clearTimeout(userTypingTimer.current)
    if (!value.trim()) {
      setIsUserTyping(false)
      return
    }
    stickRef.current = true
    setIsUserTyping(true)
    userTypingTimer.current = setTimeout(() => setIsUserTyping(false), 1200)
  }

  const lastBotId = [...messages].reverse().find((m) => m.role === 'bot')?.id
  const status = isLoading ? 'Thinking…' : typingId !== null ? 'Writing…' : 'Online'

  return (
    <View style={[styles.flex, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Avatar c={c} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: c.text }]}>ChatBot</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: isBusy ? c.amber : c.green }]} />
            <Text style={{ color: c.muted, fontSize: 12 }}>{status}</Text>
          </View>
        </View>
        <Pressable onPress={newChat} style={[styles.headerBtn, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Text style={{ color: c.textSoft, fontSize: 13, fontWeight: '600' }}>＋ New</Text>
        </Pressable>
        <Pressable
          onPress={toggleTheme}
          accessibilityLabel="Toggle theme"
          style={[styles.headerBtn, { borderColor: c.border, backgroundColor: c.surface }]}
        >
          <Text style={{ fontSize: 15 }}>{scheme === 'dark' ? '☀️' : '🌙'}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {/* messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={isEmpty ? styles.welcomeWrap : styles.messages}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (stickRef.current) scrollRef.current?.scrollToEnd({ animated: false })
          }}
        >
          {isEmpty ? (
            hydrated && (
              <View style={styles.welcome}>
                <View style={{ marginBottom: 16 }}>
                  <Avatar c={c} size={56} />
                </View>
                <Text style={[styles.welcomeTitle, { color: c.text }]}>How can I help you today?</Text>
                <Text style={{ color: c.muted, textAlign: 'center', marginBottom: 22, lineHeight: 21 }}>
                  Ask me anything — I can write code, explain ideas and search the web for fresh answers.
                </Text>
                <Suggestions c={c} onPick={send} />
              </View>
            )
          ) : (
            <>
              {messages.map((msg) => {
                const isTyping = msg.id === typingId
                const isUser = msg.role === 'user'
                return (
                  <View key={msg.id} style={[styles.row, isUser && { justifyContent: 'flex-end' }]}>
                    {!isUser && <Avatar c={c} />}
                    <View style={[styles.bubbleWrap, isUser ? { maxWidth: '82%', alignItems: 'flex-end' } : { flex: 1 }]}>
                      <View
                        style={[
                          styles.bubble,
                          isUser
                            ? { backgroundColor: c.accent, borderBottomRightRadius: 6 }
                            : {
                                backgroundColor: msg.error ? c.dangerSoft : c.surface,
                                borderColor: msg.error ? c.danger : c.border,
                                borderWidth: 1,
                                borderTopLeftRadius: 6,
                                alignSelf: 'flex-start',
                                maxWidth: '100%',
                              },
                        ]}
                      >
                        {isUser ? (
                          <Text selectable style={{ color: '#fff', fontSize: 15, lineHeight: 22 }}>
                            {msg.text}
                          </Text>
                        ) : msg.error ? (
                          <Text style={{ color: c.danger, fontSize: 15, lineHeight: 22 }}>{msg.text}</Text>
                        ) : isTyping ? (
                          <Typewriter text={msg.text} c={c} onDone={() => setTypingId(null)} />
                        ) : (
                          <MarkdownView c={c}>{msg.text}</MarkdownView>
                        )}
                      </View>

                      {msg.sources?.length > 0 && !isTyping && (
                        <View style={styles.sources}>
                          {msg.sources.slice(0, 4).map((s, i) => (
                            <Pressable
                              key={i}
                              onPress={() => Linking.openURL(s.url)}
                              style={[styles.chip, { backgroundColor: c.surface, borderColor: c.border }]}
                            >
                              <View style={[styles.chipNum, { backgroundColor: c.accentSoft }]}>
                                <Text style={{ color: c.accent, fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
                              </View>
                              <Text numberOfLines={1} style={{ color: c.textSoft, fontSize: 12, maxWidth: 170 }}>
                                {s.title || s.url}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}

                      <View style={[styles.meta, isUser && { justifyContent: 'flex-end' }]}>
                        <Text style={{ color: c.muted, fontSize: 11 }}>{formatTime(msg.time)}</Text>
                        {!isUser && !isTyping && (
                          <View style={styles.actions}>
                            {!msg.error && <CopyButton text={msg.text} c={c} />}
                            {!msg.error && (
                              <>
                                <Pressable hitSlop={8} onPress={() => setFeedback(msg.id, 'up')} style={styles.actionBtn}>
                                  <Text style={{ opacity: msg.feedback === 'up' ? 1 : 0.45 }}>👍</Text>
                                </Pressable>
                                <Pressable hitSlop={8} onPress={() => setFeedback(msg.id, 'down')} style={styles.actionBtn}>
                                  <Text style={{ opacity: msg.feedback === 'down' ? 1 : 0.45 }}>👎</Text>
                                </Pressable>
                              </>
                            )}
                            {msg.id === lastBotId && !isBusy && (
                              <Pressable hitSlop={8} onPress={regenerate} style={styles.actionBtn}>
                                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>
                                  ↻ {msg.error ? 'Retry' : 'Regenerate'}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                )
              })}

              {isLoading && (
                <View style={styles.row}>
                  <Avatar c={c} />
                  <View style={[styles.bubble, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderTopLeftRadius: 6 }]}>
                    <TypingDots color={c.muted} />
                  </View>
                </View>
              )}

              {isUserTyping && (
                <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                  <View style={[styles.bubble, { backgroundColor: c.accent, borderBottomRightRadius: 6 }]}>
                    <TypingDots color="rgba(255,255,255,0.85)" />
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* composer */}
        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={[styles.composer, { backgroundColor: c.surface, borderColor: c.border }]}>
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="Message ChatBot…"
              placeholderTextColor={c.muted}
              value={input}
              onChangeText={handleChangeText}
              multiline
              maxLength={4000}
            />
            {isBusy ? (
              <Pressable onPress={stop} accessibilityLabel="Stop" style={[styles.send, { backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border }]}>
                <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: c.text }} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => send(input)}
                disabled={!input.trim()}
                accessibilityLabel="Send"
                style={[styles.send, { backgroundColor: c.accent, opacity: input.trim() ? 1 : 0.4 }]}
              >
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 }}>↑</Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Chat />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headerBtn: {
    height: 36,
    minWidth: 36,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: { padding: 14, gap: 18 },
  welcomeWrap: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  welcome: { alignItems: 'center' },
  welcomeTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bubbleWrap: { gap: 6 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    borderWidth: 1,
    borderRadius: 999,
  },
  chipNum: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 6,
    borderWidth: 1,
    borderRadius: 24,
  },
  input: { flex: 1, maxHeight: 140, fontSize: 15, paddingTop: 8, paddingBottom: 8 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
})
