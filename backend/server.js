
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

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: message.trim(),
      config: {
        systemInstruction:
          "You are a friendly and helpful AI chatbot. Answer naturally and clearly."
      }
    });

    res.json({
      reply: response.text
    });

  } catch (error) {
    console.error("Gemini error:", error);

    res.status(500).json({
      error: "Unable to generate AI response"
    });
  }
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Gemini chatbot running on port ${PORT}`);
});
