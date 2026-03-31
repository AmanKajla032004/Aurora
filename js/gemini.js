// ─── Gemini AI — Multi-key rotation system ────────────────────
// Store up to 5 API keys in Firestore under appConfig/gemini
// Field: keys (array) or key (single string — legacy)
// When one key hits quota, auto-rotates to the next
// Keys reset at midnight Pacific time (Gemini quota window)

import { db } from "./firebase/firebaseConfig.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ───────── GLOBAL AUTO AI GUARD ───────── */
if (window.__autoAIAllowed === undefined) {
  window.__autoAIAllowed = false;
}

const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// In-memory state
let _keys         = [];
let _keyIndex     = 0;
let _exhausted    = new Set();
let _lastFetched  = 0;

// ── Key management ─────────────────────────────────────────────
async function loadKeys() {
  if (_keys.length && Date.now() - _lastFetched < 60000) return;

  try {
    const snap = await getDoc(doc(db, "appConfig", "gemini"));
    if (!snap.exists()) return;
    const data = snap.data();

    if (Array.isArray(data.keys) && data.keys.length) {
      _keys = data.keys.filter(k => k && k.length > 10 && !k.includes("YOUR_KEY"));
    } else if (data.key && data.key.length > 10 && !data.key.includes("YOUR_KEY")) {
      _keys = [data.key];
    }

    _lastFetched = Date.now();

    const nowPT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const dayKey = `${nowPT.getFullYear()}-${nowPT.getMonth()}-${nowPT.getDate()}`;
    const storedDay = sessionStorage.getItem("aurora_gemini_day");
    if (storedDay !== dayKey) {
      _exhausted.clear();
      _keyIndex = 0;
      sessionStorage.setItem("aurora_gemini_day", dayKey);
    }
  } catch(e) {
    console.warn("Could not load Gemini keys from Firestore:", e.message);
  }

  if (!_keys.length) {
    try {
      const { GEMINI_KEY } = await import("./config.js");
      if (GEMINI_KEY && GEMINI_KEY.length > 10 && !GEMINI_KEY.includes("YOUR_KEY")) {
        _keys = [GEMINI_KEY];
      }
    } catch {}
  }
}

function getActiveKey() {
  if (!_keys.length) return null;
  for (let i = 0; i < _keys.length; i++) {
    const idx = (_keyIndex + i) % _keys.length;
    if (!_exhausted.has(idx)) {
      _keyIndex = idx;
      return _keys[idx];
    }
  }
  return null;
}

function markCurrentKeyExhausted() {
  _exhausted.add(_keyIndex);
  _keyIndex = (_keyIndex + 1) % _keys.length;
  const remaining = _keys.length - _exhausted.size;
  console.warn(`Key ${_keyIndex} quota reached. ${remaining} key(s) remaining.`);
}

// ── Core API call ──────────────────────────────────────────────
export async function askGemini(prompt, maxTokens = 900) {
  await loadKeys();

  const key = getActiveKey();
  if (!key) {
    const allExhausted = _exhausted.size >= _keys.length && _keys.length > 0;
    if (allExhausted) {
      throw new Error(
        `All ${_keys.length} API key${_keys.length !== 1 ? "s" : ""} have reached today's quota.\n\n` +
        "Quotas reset at midnight Pacific time.\n" +
        "Add more keys via js/saveApiKey.html or wait until tomorrow."
      );
    }
    throw new Error(
      "No Gemini API key configured.\n\n" +
      "Open js/saveApiKey.html to save your key.\n" +
      "Get a free key at: aistudio.google.com"
    );
  }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
  });

  for (let attempt = 0; attempt < _keys.length + 1; attempt++) {
    const currentKey = getActiveKey();
    if (!currentKey) break;

    for (const model of MODELS) {
      let res, data;
      try {
        res  = await fetch(`${BASE}/${model}:generateContent?key=${currentKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body
        });
        data = await res.json();
      } catch(e) {
        console.warn(`${model} network error:`, e.message);
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
        markCurrentKeyExhausted();
        break;
      }
      if (status === 429 || msg.includes("quota")) {
        markCurrentKeyExhausted();
        break;
      }
    }
  }

  throw new Error("All Gemini models failed.");
}