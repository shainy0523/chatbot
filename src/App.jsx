import { useState, useEffect, useRef } from 'react'
import './App.css'

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function App() {
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "Hi there! Ask me something to get started.",
      time: new Date()
    }
  ])
  const [isBotTyping, setIsBotTyping] = useState(false)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimeout = useRef(null)

  // keep the newest message in view
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isBotTyping, isUserTyping])

  // clear the timer if the component unmounts
  useEffect(() => () => clearTimeout(typingTimeout.current), [])

  function handleInputChange(e) {
    const value = e.target.value
    setMessage(value)

    clearTimeout(typingTimeout.current)
    if (!value.trim()) {
      setIsUserTyping(false)
      return
    }
    // "typing" while keys are being pressed; stops after 1.2s of no input
    setIsUserTyping(true)
    typingTimeout.current = setTimeout(() => setIsUserTyping(false), 1200)
  }

  // bot message
  function botMessage(userMessage) {
    const text = userMessage.toLowerCase();

    if (text.includes("hello")) {
      return "Hello! How can I help you today?";
    }
    if (text.includes("how are you")) {
      return "I'm just a bot, but I'm doing well! How about you?";
    }

    if (text.includes("name")) {
      return "I am your chatbot assistant.";
    }

    if (text.includes("bye")) {
      return "Goodbye! Have a nice day.";
    }

    return "Sorry, I don't understand that yet.";
  }

  // function handleSendMessage() {
  //   if (!message.trim() || isBotTyping) return

  //   const sentText = message.trim()

  //   // 1. show the user's message right away
  //   setMessages((prev) => [
  //     ...prev,
  //     { sender: "user", text: sentText, time: new Date() }
  //   ]);
  //   setMessage("");
  //   clearTimeout(typingTimeout.current);
  //   setIsUserTyping(false);
  //   inputRef.current?.focus();

  //   // 2. bot "typing..." for a moment, then show the reply
  //   setIsBotTyping(true);
  //   setTimeout(() => {
  //     setMessages((prev) => [
  //       ...prev,
  //       { sender: "bot", text: botMessage(sentText), time: new Date() }
  //     ]);
  //     setIsBotTyping(false);
  //   }, 1500);
  // }


async function handleSendMessage() {
  if (!message.trim() || isBotTyping) return;

  const sentText = message.trim();

  // 1. Display user message immediately
  setMessages((prev) => [
    ...prev,
    {
      sender: "user",
      text: sentText,
      time: new Date()
    }
  ]);

  // 2. Clear input
  setMessage("");
  clearTimeout(typingTimeout.current);
  setIsUserTyping(false);

  inputRef.current?.focus();

  // 3. Show bot typing indicator
  setIsBotTyping(true);

  try {
    // 4. Send message to Express backend
    const response = await fetch(
      "http://localhost:5001/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: sentText
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Something went wrong"
      );
    }

    // 5. Display AI-generated response
    setMessages((prev) => [
      ...prev,
      {
        sender: "bot",
        text: data.reply,
        sources: data.sources || [],
        time: new Date()
      }
    ]);

  } catch (error) {
    console.error("Chat error:", error);

    setMessages((prev) => [
      ...prev,
      {
        sender: "bot",
        text: "Sorry, something went wrong. Please try again.",
        time: new Date()
      }
    ]);

  } finally {
    // 6. Stop typing indicator
    setIsBotTyping(false);
  }
}


  return (
    <div className="chat">
      <header className="chat-header">
        <div className="avatar bot">AI</div>
        <div>
          <h1 className="chat-title">ChatBot</h1>
          <span className="chat-status">
            <span className="status-dot" />
            {isBotTyping ? "typing..." : "Online"}
          </span>
        </div>
      </header>

      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`row ${msg.sender}`}>
            {msg.sender === "bot" && <div className="avatar bot">AI</div>}
            <div className="bubble-wrap">
              <div className="bubble">{msg.text}</div>
              {msg.sources?.length > 0 && (
                <div className="sources">
                  Sources:{" "}
                  {msg.sources.slice(0, 3).map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noreferrer">
                      {s.title || new URL(s.url).hostname}
                    </a>
                  ))}
                </div>
              )}
              <span className="time">{formatTime(msg.time)}</span>
            </div>
          </div>
        ))}

        {isBotTyping && (
          <div className="row bot">
            <div className="avatar bot">AI</div>
            <div className="bubble typing" aria-label="Bot is typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        {isUserTyping && (
          <div className="row user">
            <div className="bubble typing user-typing" aria-label="You are typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          handleSendMessage()
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={handleInputChange}
        />
        <button type="submit" disabled={!message.trim() || isBotTyping} aria-label="Send">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" />
          </svg>
        </button>
      </form>
    </div>
  )
}

export default App
