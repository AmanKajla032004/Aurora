// ─── Gemini AI — Multi-key rotation system ────────────────────
// Store up to 5 API keys in Firestore under appConfig/gemini
// Field: keys (array) or key (single string — legacy)
// When one key hits quota, auto-rotates to the next
// Keys reset at midnight Pacific time (Gemini quota window)

import { db } from "./firebase/firebaseConfig.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// In-memory state
let _keys         = [];          // all configured keys
let _keyIndex     = 0;           // which key we're currently using
let _exhausted    = new Set();   // indices of keys that hit quota today
let _lastFetched  = 0;           // timestamp of last Firestore fetch

// ── Key management ─────────────────────────────────────────────
async function loadKeys() {
  // Re-fetch from Firestore at most once every 60s (avoid hammering)
  if (_keys.length && Date.now() - _lastFetched < 60000) return;

  try {
    const snap = await getDoc(doc(db, "appConfig", "gemini"));
    if (!snap.exists()) return;
    const data = snap.data();

    // Support both old single-key format and new multi-key array
    if (Array.isArray(data.keys) && data.keys.length) {
      _keys = data.keys.filter(k => k && k.length > 10 && !k.includes("YOUR_KEY"));
    } else if (data.key && data.key.length > 10 && !data.key.includes("YOUR_KEY")) {
      _keys = [data.key];
    }

    _lastFetched = Date.now();

    // Reset exhausted set at start of each day (Pacific time)
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

  // Fallback: config.js (local dev only)
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
  // Find first non-exhausted key starting from current index
  for (let i = 0; i < _keys.length; i++) {
    const idx = (_keyIndex + i) % _keys.length;
    if (!_exhausted.has(idx)) {
      _keyIndex = idx;
      return _keys[idx];
    }
  }
  return null; // all keys exhausted
}

function markCurrentKeyExhausted() {
  _exhausted.add(_keyIndex);
  // Advance to next key
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

  // Try all models with current key, then rotate key on quota
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
        // This key is revoked — mark exhausted and try next
        markCurrentKeyExhausted();
        break; // break model loop, outer loop will retry with next key
      }
      if (status === 429 || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource exhausted")) {
        // Quota hit — mark this key exhausted, try next key
        markCurrentKeyExhausted();
        break; // break model loop
      }
      if (status === 404 || msg.includes("not found") || msg.includes("deprecated")) {
        continue; // try next model
      }
      continue;
    }

    // If we broke out of models loop due to key rotation, retry with next key
    const nextKey = getActiveKey();
    if (!nextKey || nextKey === currentKey) break;
  }

  const remaining = _keys.length - _exhausted.size;
  if (remaining <= 0) {
    throw new Error(
      `All ${_keys.length} API key${_keys.length !== 1 ? "s" : ""} have reached today's quota.\n` +
      "Resets at midnight Pacific. Add keys at js/saveApiKey.html."
    );
  }
  throw new Error("AI request failed — check your API key at js/saveApiKey.html");
}

// ── Line-list helper (replaces JSON arrays — far cheaper) ──────
// Ask AI to return a simple numbered or bulleted list.
// Returns a plain JS array of strings. One API call, no retry.
export async function askGeminiList(prompt, maxTokens = 400) {
  const raw = await askGemini(
    prompt + "\n\nFormat: output ONLY a plain numbered list, one item per line, no extra text. Example:\n1. First item\n2. Second item",
    maxTokens
  );
  return raw
    .split("\n")
    .map(l => l.replace(/^[\d]+[.)\s]+/, "").replace(/^[-*•]\s*/, "").trim())
    .filter(l => l.length > 2 && l.length < 300);
}

// ── Structured text helper (replaces JSON objects) ──────────────
// For SWOT-style objects. Ask AI to use SECTION: lines format.
// Returns a plain JS object. One API call, no retry.
export async function askGeminiStructured(prompt, sections, maxTokens = 500) {
  const sectionList = sections.join(", ");
  const example = sections.map(s => `${s.toUpperCase()}:\n- item one\n- item two`).join("\n");
  const raw = await askGemini(
    prompt + "\n\nFormat: output ONLY plain text using these exact section headings, nothing else:\n" + example + "\n\nUse exactly these section names: " + sectionList,
    maxTokens
  );

  const result = {};
  sections.forEach(s => { result[s] = []; });

  let currentSection = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Check if this line is a section header
    const matchedSection = sections.find(s =>
      trimmed.toLowerCase().startsWith(s.toLowerCase() + ":") ||
      trimmed.toLowerCase() === s.toLowerCase()
    );
    if (matchedSection) { currentSection = matchedSection; continue; }
    // It's a content line
    if (currentSection) {
      const item = trimmed.replace(/^[-*•\d.)]\s*/, "").trim();
      if (item.length > 2) result[currentSection].push(item);
    }
  }
  return result;
}

// ── JSON helper (kept for backward compat, now uses one call) ──
export async function askGeminiJSON(prompt, maxTokens = 600) {
  const raw = await askGemini(
    prompt + "\n\nOutput ONLY valid JSON starting with { or [. No markdown.",
    maxTokens
  );
  // Strip any markdown fences
  let s = raw.trim().replace(/^```(?:json)?\s*/gm, "").replace(/^```\s*$/gm, "").trim();
  const start = s.search(/[\[{]/);
  if (start > 0) s = s.slice(start);
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (end >= 0 && end < s.length - 1) s = s.slice(0, end + 1);
  try { return JSON.parse(s); } catch {}
  const m = s.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) try { return JSON.parse(m[1]); } catch {}
  throw new Error("AI response could not be parsed — please try again.");
}

// ── Key status (for saveApiKey.html UI) ───────────────────────
export function getKeyStatus() {
  return {
    total:     _keys.length,
    active:    _keys.length - _exhausted.size,
    exhausted: _exhausted.size,
    currentIndex: _keyIndex
  };
}

// ── Save keys to Firestore ─────────────────────────────────────
export async function saveKeysToFirestore(keysArray) {
  if (!Array.isArray(keysArray)) keysArray = [keysArray];
  const validKeys = keysArray.map(k => k.trim()).filter(k => k.length > 10);
  await setDoc(doc(db, "appConfig", "gemini"), {
    keys: validKeys,
    key:  validKeys[0] || "",  // legacy single-key field
    updatedAt: new Date().toISOString(),
    keyCount: validKeys.length
  });
  _keys = validKeys;
  _exhausted.clear();
  _keyIndex = 0;
  _lastFetched = Date.now();
}

// Legacy single-key save (backward compat)
export async function saveKeyToFirestore(newKey) {
  await saveKeysToFirestore([newKey]);
}