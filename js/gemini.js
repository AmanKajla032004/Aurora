// ─── Gemini AI — Secure Key via Firestore ─────────────────────
// Key is stored in Firestore (never in code or GitHub)
// Run js/saveApiKey.html once locally to save your key

import { db } from "./firebase/firebaseConfig.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MODELS = [
  "gemini-2.0-flash",          // most reliable free tier
  "gemini-2.0-flash-lite",     // fallback
  "gemini-1.5-flash",          // stable fallback
  "gemini-1.5-flash-8b",       // smallest/fastest fallback
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
    } catch(fetchErr) {
      console.warn(`Model ${model} fetch error:`, fetchErr.message);
      continue;
    }

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
      "Quota reached for today. Wait until tomorrow or get a new key at aistudio.google.com"
    );
  }

  throw new Error("All AI models failed. Check your API key at js/saveApiKey.html");
}

export async function askGeminiJSON(prompt, maxTokens = 600) {
  const cleanJSON = (raw) => {
    if (!raw) return null;
    let s = raw.trim();
    // Remove all code fences
    s = s.replace(/^```(?:json|JSON)?\s*/gm, "").replace(/^```\s*$/gm, "").trim();
    // Find where JSON starts
    const start = s.search(/[\[{]/);
    if (start > 0) s = s.slice(start);
    // Find where JSON ends (last closing brace/bracket)
    const lastObj = s.lastIndexOf("}");
    const lastArr = s.lastIndexOf("]");
    const end = Math.max(lastObj, lastArr);
    if (end >= 0 && end < s.length - 1) s = s.slice(0, end + 1);
    return s.trim();
  };

  // First attempt
  const raw1 = await askGemini(
    prompt + "\n\nIMPORTANT: Output ONLY valid JSON, starting with { or [. No markdown, no explanation.",
    maxTokens
  );
  const c1 = cleanJSON(raw1);
  if (c1) {
    try { return JSON.parse(c1); } catch {}
    // Try regex extraction
    const m1 = c1.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m1) try { return JSON.parse(m1[1]); } catch {}
  }

  // Second attempt — even more explicit
  const raw2 = await askGemini(
    "Output ONLY a JSON object or array, nothing else. No text, no markdown.\n\n" + prompt,
    maxTokens
  );
  const c2 = cleanJSON(raw2);
  if (c2) {
    try { return JSON.parse(c2); } catch {}
    const m2 = c2.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m2) try { return JSON.parse(m2[1]); } catch {}
  }

  throw new Error("AI response could not be parsed — please try again.");
}