
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const SEARCH_HEADERS = { "User-Agent": "my-chatbot/1.0" };

// Tavily: better web/news search. Free tier at https://tavily.com (set TAVILY_API_KEY)
async function searchTavily(query) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error(`Tavily ${r.status}`);
  const data = await r.json();
  return (data.results ?? []).map((x) => ({
    title: x.title,
    url: x.url,
    content: (x.content ?? "").slice(0, 1500)
  }));
}

// Wikipedia: free, no API key needed
async function searchWikipedia(query) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "4",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    redirects: "1",
    format: "json"
  });
  const r = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: SEARCH_HEADERS,
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error(`Wikipedia ${r.status}`);
  const data = await r.json();
  const pages = Object.values(data.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.extract)
    .map((p) => ({
      pageid: p.pageid,
      title: p.title,
      url: p.fullurl,
      content: p.extract.slice(0, 1500)
    }));

  // The intro often omits current facts (e.g. who holds an office), so pull
  // the full article text for the best matches.
  await Promise.all(
    pages.slice(0, 2).map(async (page) => {
      try {
        const full = await fetchWikipediaFullText(page.pageid);
        if (full) page.content = full.slice(0, 6000);
      } catch {
        /* keep the intro */
      }
    })
  );

  return pages.map(({ title, url, content }) => ({ title, url, content }));
}

async function fetchWikipediaFullText(pageid) {
  const params = new URLSearchParams({
    action: "query",
    pageids: String(pageid),
    prop: "extracts",
    explaintext: "1",
    format: "json"
  });
  const r = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: SEARCH_HEADERS,
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) return "";
  const data = await r.json();
  return Object.values(data.query?.pages ?? {})[0]?.extract ?? "";
}

async function searchWeb(query) {
  try {
    return process.env.TAVILY_API_KEY
      ? await searchTavily(query)
      : await searchWikipedia(query);
  } catch (error) {
    console.warn("Web search failed:", error.message);
    return [];
  }
}

// Ask Gemini for a short, correctly spelled search query. Returns null when
// the message needs no lookup (greetings, thanks, casual chat).
async function buildSearchQuery(question) {
  try {
    const r = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: question,
      config: {
        systemInstruction:
          "Rewrite the user's message as a short, correctly spelled web search query " +
          "(e.g. 'Tamilnadu' -> 'Tamil Nadu'). Reply with ONLY the query. " +
          "If the message is just a greeting, thanks or casual chat that needs no lookup, reply NONE.",
        temperature: 0
      }
    });
    const q = (r.text ?? "").trim().replace(/^["']|["']$/g, "");
    return !q || /^none$/i.test(q) ? null : q.slice(0, 200);
  } catch (error) {
    console.warn("Query rewrite failed:", error.message);
    return question; // fall back to the raw question
  }
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const question = message.trim();

    // 1. Turn the question into a clean search query (or skip search for chit-chat),
    //    then look it up on the web (free: Tavily if keyed, else Wikipedia)
    const query = await buildSearchQuery(question);
    const results = query ? await searchWeb(query) : [];
    const sources = results.map(({ title, url }) => ({ title, url }));

    // 2. Give the results to Gemini as context
    const context = results.length
      ? results
          .map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.content}`)
          .join("\n\n")
      : "";

    const systemInstruction =
      "You are a friendly and helpful AI chatbot. Answer naturally and clearly. " +
      `Today's date is ${new Date().toDateString()}. ` +
      "Your training data is out of date. When web search results are provided below, " +
      "treat them as more up to date than your memory and base your answer on them. " +
      "Ignore results that are not relevant to the question." +
      (context ? `\n\nWEB SEARCH RESULTS:\n${context}` : "");

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: question,
      config: { systemInstruction }
    });

    const notice = !query || results.length
      ? ""
      : "\n\n⚠️ I couldn't fetch live web results for this, so this answer may be out of date.";

    res.json({
      reply: response.text + notice,
      sources
    });

  } catch (error) {
    console.error("Gemini error:", error);

    if (error?.status === 429) {
      return res.status(429).json({
        error: "Gemini API quota exceeded. Please wait a minute or check your plan and billing."
      });
    }

    res.status(500).json({
      error: "Unable to generate AI response"
    });
  }
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Gemini chatbot running on port ${PORT}`);
});
