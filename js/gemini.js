// ─── Gemini AI — Secure Key via Firestore ─────────────────────
// Key is stored in Firestore (never in code or GitHub)
// Run js/saveApiKey.html once locally to save your key

import { db } from "./firebase/firebaseConfig.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Cache the key in memory so we only fetch Firestore once per session
let _cachedKey = null;

async function getKey() {
  if (_cachedKey) return _cachedKey;

  // Try Firestore first (works on both local and hosted)
  try {
    const snap = await getDoc(doc(db, "appConfig", "gemini"));
    if (snap.exists() && snap.data().key) {
      _cachedKey = snap.data().key;
      return _cachedKey;
    }
  } catch(e) {
    // Firestore unavailable — fall through to config.js
  }

  // Fallback: try config.js (local dev only — not on GitHub)
  try {
    const { GEMINI_KEY } = await import("./config.js");
    if (GEMINI_KEY && GEMINI_KEY.length > 10 && !GEMINI_KEY.includes("YOUR_KEY")) {
      _cachedKey = GEMINI_KEY;
      return _cachedKey;
    }
  } catch(e) {
    // config.js doesn't exist (normal on GitHub/hosted)
  }

  return null;
}

export async function askGemini(prompt, maxTokens = 900) {
  const key = await getKey();

  if (!key) {
    throw new Error(
      "No Gemini API key configured.\n\n" +
      "Open js/saveApiKey.html in your browser to save your key securely.\n" +
      "Get a free key at: aistudio.google.com"
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
      res  = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      data = await res.json();
    } catch { continue; }

    if (res.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      if (data?.candidates?.[0]?.finishReason === "SAFETY")
        throw new Error("Blocked by safety filter — rephrase your prompt.");
      continue;
    }

    const status = res.status;
    const msg    = (data?.error?.message || "").toLowerCase();

    if (status === 400 && !msg.includes("not found") && !msg.includes("deprecated")) {
      throw new Error(`Bad request: ${data?.error?.message || "check your prompt"}`);
    }
    if (status === 403) {
      // Key is bad — clear cache so next call retries Firestore
      _cachedKey = null;
      throw new Error(
        "API key rejected (403) — your key has been revoked.\n\n" +
        "This usually happens when a key is exposed on GitHub.\n\n" +
        "Fix:\n" +
        "1. Get a new key at aistudio.google.com\n" +
        "2. Open js/saveApiKey.html and save the new key\n" +
        "3. Make sure js/config.js is in your .gitignore"
      );
    }
    if (status === 404 || msg.includes("not found") || msg.includes("deprecated")) {
      notFound.push(model); continue;
    }
    if (status === 429 || msg.includes("quota") || msg.includes("rate")) {
      rateLimited.push(model); continue;
    }
    continue;
  }

  if (rateLimited.length > 0) {
    throw new Error(
      "Daily quota reached.\n\n" +
      "Free limits: gemini-2.5-flash-lite = 1000/day, gemini-2.5-flash = 250/day\n" +
      "Options:\n" +
      "• Wait until midnight Pacific time (quota resets daily)\n" +
      "• Get a fresh API key at aistudio.google.com → save via saveApiKey.html"
    );
  }

  throw new Error("AI request failed — open saveApiKey.html to update your key.");
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

// Expose a way to update the key at runtime (used by saveApiKey.html)
export async function saveKeyToFirestore(newKey) {
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  await setDoc(doc(db, "appConfig", "gemini"), { key: newKey, updatedAt: new Date().toISOString() });
  _cachedKey = newKey;
}