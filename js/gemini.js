// ─── Gemini AI Helper ─────────────────────────────────────────
// Models updated Feb 2026 — 1.5 family retired April 2025
import { GEMINI_KEY } from "./config.js";

// Current free-tier models (fastest/cheapest first)
const MODELS = [
  "gemini-2.5-flash-lite",   // 1000 req/day free — fastest
  "gemini-2.5-flash",        // 250 req/day free  — smarter
  "gemini-2.0-flash",        // fallback
  "gemini-2.0-flash-lite",   // fallback
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function askGemini(prompt, maxTokens = 900) {
  if (!GEMINI_KEY || GEMINI_KEY.length < 10) {
    throw new Error(
      "No Gemini API key found.\n" +
      "Get a free key at aistudio.google.com and paste it into js/config.js"
    );
  }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
  });

  const rateLimited = [];
  const notFound    = [];

  for (const model of MODELS) {
    let res, data;
    try {
      res  = await fetch(`${BASE}/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      data = await res.json();
    } catch {
      continue;
    }

    // ── Success ──────────────────────────────────────────────
    if (res.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      if (data?.candidates?.[0]?.finishReason === "SAFETY")
        throw new Error("Blocked by safety filter — rephrase your prompt.");
      continue;
    }

    const status = res.status;
    const msg    = (data?.error?.message || "").toLowerCase();

    // ── Hard failures — stop immediately ────────────────────
    if (status === 400 && !msg.includes("not found") && !msg.includes("deprecated")) {
      throw new Error(`Bad request: ${data?.error?.message || "check your prompt"}`);
    }
    if (status === 403) {
      throw new Error(
        "API key rejected (403) — your key is invalid or revoked.\n" +
        "Get a new free key at: aistudio.google.com"
      );
    }

    // ── Soft failures — try next model ───────────────────────
    if (status === 404 || msg.includes("not found") || msg.includes("deprecated") || msg.includes("not supported")) {
      notFound.push(model); continue;
    }
    if (status === 429 || msg.includes("quota") || msg.includes("rate")) {
      rateLimited.push(model); continue;
    }

    // Unknown error — try next
    continue;
  }

  // ── All models failed — give clear diagnosis ─────────────
  if (notFound.length === MODELS.length) {
    throw new Error(
      "API key issue — none of the Gemini models responded.\n\n" +
      "Your API key may be from an old project or restricted.\n" +
      "Fix: Go to aistudio.google.com → Get API Key → create a NEW key → paste into js/config.js"
    );
  }

  if (rateLimited.length > 0) {
    throw new Error(
      "Daily quota reached for all Gemini models.\n\n" +
      "Free limits: gemini-2.5-flash-lite = 1000/day, gemini-2.5-flash = 250/day\n" +
      "Options:\n" +
      "• Wait until midnight Pacific time (quota resets)\n" +
      "• Create a new API key at aistudio.google.com (each key gets fresh quota)"
    );
  }

  throw new Error("AI request failed — check your API key at aistudio.google.com");
}

export async function askGeminiJSON(prompt, maxTokens = 600) {
  const full  = prompt + "\n\nRespond ONLY with raw JSON. No markdown, no code fences. Start directly with { or [";
  const raw   = await askGemini(full, maxTokens);
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(clean); } catch {
    const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) try { return JSON.parse(m[1]); } catch {}
    throw new Error("AI returned invalid JSON — try again.");
  }
}
