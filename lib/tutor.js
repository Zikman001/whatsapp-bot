/**
 * AI coding & engineering tutor, powered by Groq's free API
 * (genuinely free tier, no billing info required to sign up).
 * Keeps a short rolling history per chat so follow-up questions
 * ("what about async?") have context.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = "llama-3.3-70b-versatile";

const historyByChat = new Map();
const MAX_TURNS = 6; // keep last 6 messages (3 exchanges) per chat

const SYSTEM_PROMPT =
  "You are a patient, clear coding and software-engineering tutor teaching " +
  "over WhatsApp. Explain concepts simply first, then go deeper if asked. " +
  "Cover everything from basics (variables, loops) to complex engineering " +
  "principles (system design, concurrency, databases, architecture patterns). " +
  "Use short paragraphs and simple formatting — no huge markdown tables, this " +
  "is a chat app on a phone. Use small code snippets when helpful, kept short.";

async function askTutor(chatId, question) {
  if (!GROQ_API_KEY) {
    return "The bot's coding tutor isn't set up yet — add a GROQ_API_KEY environment variable to enable it (free at console.groq.com).";
  }

  const history = historyByChat.get(chatId) || [];
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: question },
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Tutor API error:", errText);
    return "Sorry, the tutor is having trouble right now — try again in a moment.";
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim() || "(no response)";

  const updatedHistory = [
    ...history,
    { role: "user", content: question },
    { role: "assistant", content: answer },
  ].slice(-MAX_TURNS);
  historyByChat.set(chatId, updatedHistory);

  return answer;
}

module.exports = { askTutor };
