// Where the chatbot backend lives.
//
// A phone can't reach "localhost" on your computer, so use your computer's
// LAN IP (same Wi-Fi) while developing, or a deployed https URL for a real build.
// Override without editing code by setting EXPO_PUBLIC_API_URL in mobile/.env
export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.7:5001/api'

export const FALLBACK_SUGGESTIONS = [
  { icon: '💻', text: 'Write a 5-star pyramid pattern in JavaScript' },
  { icon: '🧠', text: 'Explain closures in JavaScript with an example' },
  { icon: '🌐', text: "What's the latest news in AI?" },
  { icon: '✈️', text: 'Plan a 3-day trip to Tokyo' },
]
