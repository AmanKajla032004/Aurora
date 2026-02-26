import { db, auth } from "../firebase/firebaseConfig.js";
import { askGemini } from "../gemini.js";
import {
  doc, getDoc, setDoc, collection, query,
  orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Helpers ───────────────────────────────────────────────────
function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function saveEntry(data) {
  const uid  = auth.currentUser?.uid;
  if (!uid) return;
  const key  = localDateKey();
  await setDoc(doc(db, "wellbeing", uid, "entries", key), {
    ...data, date: key, savedAt: serverTimestamp()
  }, { merge: true });
}

async function loadTodayEntry() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "wellbeing", uid, "entries", localDateKey()));
  return snap.exists() ? snap.data() : null;
}

async function loadHistory(n = 14) {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const q    = query(collection(db, "wellbeing", uid, "entries"), orderBy("date", "desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data()).reverse();
}

// ── Render ────────────────────────────────────────────────────
export function renderWellbeing() {
  return `<div class="wb-page" id="wellbeingPage">
    <div class="wb-header">
      <div>
        <h2 class="wb-title">Wellbeing</h2>
        <div class="wb-subtitle">Track how you're doing — mind and body</div>
      </div>
      <button class="wb-ai-btn" id="wbAiBtn">✦ AI Check-in</button>
    </div>

    <!-- Today card -->
    <div class="wb-today-card" id="wbTodayCard">
      <div class="wb-card-title">📅 Today's Check-in</div>

      <!-- Mood -->
      <div class="wb-field">
        <div class="wb-field-label">Mood</div>
        <div class="wb-emoji-row" id="wbMoodRow">
          ${["😞","😔","😐","🙂","😊","😄","🤩"].map((e,i) =>
            `<button class="wb-emoji-btn" data-group="mood" data-val="${i+1}" title="${["Terrible","Bad","Meh","Okay","Good","Great","Amazing"][i]}">${e}</button>`
          ).join("")}
        </div>
      </div>

      <!-- Energy -->
      <div class="wb-field">
        <div class="wb-field-label">Energy</div>
        <div class="wb-emoji-row" id="wbEnergyRow">
          ${["🪫","😴","🐢","⚡","🔋","🚀"].map((e,i) =>
            `<button class="wb-emoji-btn" data-group="energy" data-val="${i+1}" title="${["Drained","Tired","Low","Okay","Good","Energized"][i]}">${e}</button>`
          ).join("")}
        </div>
      </div>

      <!-- Stress -->
      <div class="wb-field">
        <div class="wb-field-label">Stress</div>
        <div class="wb-stress-row">
          ${[1,2,3,4,5].map(v =>
            `<button class="wb-stress-btn" data-val="${v}">${v}</button>`
          ).join("")}
          <span class="wb-stress-labels"><span>Calm</span><span>Overwhelmed</span></span>
        </div>
      </div>

      <!-- Sleep & Water -->
      <div class="wb-row-2col">
        <div class="wb-field">
          <div class="wb-field-label">💤 Sleep (hours)</div>
          <div class="wb-stepper">
            <button class="wb-step-btn" data-target="sleep" data-delta="-0.5">−</button>
            <span class="wb-step-val" id="sleepVal">7</span>
            <button class="wb-step-btn" data-target="sleep" data-delta="0.5">+</button>
          </div>
        </div>
        <div class="wb-field">
          <div class="wb-field-label">💧 Water (glasses)</div>
          <div class="wb-stepper">
            <button class="wb-step-btn" data-target="water" data-delta="-1">−</button>
            <span class="wb-step-val" id="waterVal">6</span>
            <button class="wb-step-btn" data-target="water" data-delta="1">+</button>
          </div>
        </div>
      </div>

      <!-- Exercise -->
      <div class="wb-field">
        <div class="wb-field-label">🏃 Exercise today</div>
        <div class="wb-toggle-row">
          ${["None","Walk","Workout","Sport","Yoga"].map(v =>
            `<button class="wb-toggle-btn" data-group="exercise" data-val="${v}">${v}</button>`
          ).join("")}
        </div>
      </div>

      <!-- Note -->
      <div class="wb-field">
        <div class="wb-field-label">📝 Note <span style="opacity:0.4;font-size:11px">(optional)</span></div>
        <textarea class="wb-note-input" id="wbNote" placeholder="How are you feeling today? Anything on your mind..." rows="3"></textarea>
      </div>

      <button class="wb-save-btn" id="wbSaveBtn">Save Check-in ✓</button>
      <div class="wb-save-msg" id="wbSaveMsg"></div>
    </div>

    <!-- AI insight card -->
    <div class="wb-ai-card" id="wbAiCard" style="display:none">
      <div class="wb-card-title">✦ AI Wellbeing Insight</div>
      <div id="wbAiBody" class="wb-ai-body"></div>
    </div>

    <!-- 14-day trend -->
    <div class="wb-history-card" id="wbHistoryCard" style="display:none">
      <div class="wb-card-title">📈 14-Day Trends</div>
      <div class="wb-chart-wrap">
        <canvas id="wbMoodChart" height="80"></canvas>
      </div>
      <div id="wbHistoryList" class="wb-history-list"></div>
    </div>
  </div>`;
}

// ── Init ──────────────────────────────────────────────────────
let wbState = { mood: null, energy: null, stress: null, sleep: 7, water: 6, exercise: "None" };

export async function initWellbeing() {
  // Load today's entry
  const today = await loadTodayEntry().catch(() => null);
  if (today) applyState(today);

  // Emoji pickers
  document.querySelectorAll(".wb-emoji-btn").forEach(btn => {
    btn.onclick = () => {
      const group = btn.dataset.group;
      document.querySelectorAll(`.wb-emoji-btn[data-group="${group}"]`).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      wbState[group] = parseInt(btn.dataset.val);
    };
  });

  // Stress buttons
  document.querySelectorAll(".wb-stress-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".wb-stress-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      wbState.stress = parseInt(btn.dataset.val);
    };
  });

  // Toggle buttons (exercise)
  document.querySelectorAll(".wb-toggle-btn").forEach(btn => {
    btn.onclick = () => {
      const group = btn.dataset.group;
      document.querySelectorAll(`.wb-toggle-btn[data-group="${group}"]`).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      wbState[group] = btn.dataset.val;
    };
  });

  // Steppers
  document.querySelectorAll(".wb-step-btn").forEach(btn => {
    btn.onclick = () => {
      const target = btn.dataset.target;
      const delta  = parseFloat(btn.dataset.delta);
      const min    = target === "sleep" ? 0 : 0;
      const max    = target === "sleep" ? 24 : 20;
      wbState[target] = Math.max(min, Math.min(max, (wbState[target] || 0) + delta));
      const el = document.getElementById(target + "Val");
      if (el) el.textContent = wbState[target];
    };
  });

  // Save
  document.getElementById("wbSaveBtn").onclick = async () => {
    const btn = document.getElementById("wbSaveBtn");
    const msg = document.getElementById("wbSaveMsg");
    wbState.note = document.getElementById("wbNote")?.value || "";
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await saveEntry(wbState);
      msg.textContent = "✓ Saved!";
      msg.style.color = "var(--accent)";
      // Reload history
      loadAndRenderHistory();
    } catch(e) {
      msg.textContent = "Failed to save: " + e.message;
      msg.style.color = "#ef4444";
    }
    btn.disabled = false;
    btn.textContent = "Save Check-in ✓";
    setTimeout(() => { msg.textContent = ""; }, 3000);
  };

  // AI check-in
  document.getElementById("wbAiBtn").onclick = () => generateAiInsight();

  // Load history
  loadAndRenderHistory();
}

function applyState(entry) {
  wbState = { ...wbState, ...entry };

  // Restore emoji buttons
  ["mood","energy"].forEach(group => {
    if (entry[group]) {
      const btn = document.querySelector(`.wb-emoji-btn[data-group="${group}"][data-val="${entry[group]}"]`);
      if (btn) btn.classList.add("active");
    }
  });

  // Stress
  if (entry.stress) {
    const btn = document.querySelector(`.wb-stress-btn[data-val="${entry.stress}"]`);
    if (btn) btn.classList.add("active");
  }

  // Steppers
  if (entry.sleep != null) {
    wbState.sleep = entry.sleep;
    const el = document.getElementById("sleepVal");
    if (el) el.textContent = entry.sleep;
  }
  if (entry.water != null) {
    wbState.water = entry.water;
    const el = document.getElementById("waterVal");
    if (el) el.textContent = entry.water;
  }

  // Exercise
  if (entry.exercise) {
    const btn = document.querySelector(`.wb-toggle-btn[data-group="exercise"][data-val="${entry.exercise}"]`);
    if (btn) btn.classList.add("active");
  }

  // Note
  const noteEl = document.getElementById("wbNote");
  if (noteEl && entry.note) noteEl.value = entry.note;
}

async function loadAndRenderHistory() {
  const history = await loadHistory(14).catch(() => []);
  if (!history.length) return;

  const card = document.getElementById("wbHistoryCard");
  if (card) card.style.display = "block";

  renderMoodChart(history);
  renderHistoryList(history);
}

function renderMoodChart(history) {
  const canvas = document.getElementById("wbMoodChart");
  if (!canvas) return;
  const ctx  = canvas.getContext("2d");
  const w    = canvas.offsetWidth || 600;
  canvas.width  = w;
  canvas.height = 80;

  const moods  = history.map(h => h.mood || 4);
  const energy = history.map(h => h.energy || 3);
  const n      = moods.length;
  const pad    = 24;
  const xStep  = (w - pad*2) / Math.max(n-1, 1);

  const drawLine = (data, color, max) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.lineJoin    = "round";
    data.forEach((v, i) => {
      const x = pad + i * xStep;
      const y = 70 - ((v / max) * 55);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    data.forEach((v, i) => {
      const x = pad + i * xStep;
      const y = 70 - ((v / max) * 55);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  };

  ctx.clearRect(0, 0, w, 80);
  drawLine(moods, "var(--accent, #00c87a)", 7);
  drawLine(energy, "rgba(249,115,22,0.8)", 6);

  // Legend
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "var(--accent, #00c87a)";
  ctx.fillText("Mood", pad, 12);
  ctx.fillStyle = "rgba(249,115,22,0.9)";
  ctx.fillText("Energy", pad + 48, 12);
}

function renderHistoryList(history) {
  const list = document.getElementById("wbHistoryList");
  if (!list) return;
  const moodEmojis   = ["","😞","😔","😐","🙂","😊","😄","🤩"];
  const energyEmojis = ["","🪫","😴","🐢","⚡","🔋","🚀"];
  const stressColors = ["","#22c55e","#86efac","#f59e0b","#f97316","#ef4444"];

  list.innerHTML = [...history].reverse().slice(0, 7).map(h => `
    <div class="wb-hist-row">
      <div class="wb-hist-date">${new Date(h.date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
      <div class="wb-hist-icons">
        ${h.mood   ? `<span title="Mood">${moodEmojis[h.mood]}</span>` : ""}
        ${h.energy ? `<span title="Energy">${energyEmojis[h.energy]}</span>` : ""}
        ${h.stress ? `<span class="wb-hist-stress" style="background:${stressColors[h.stress]}" title="Stress ${h.stress}/5">${h.stress}</span>` : ""}
        ${h.sleep  != null ? `<span class="wb-hist-pill">💤 ${h.sleep}h</span>` : ""}
        ${h.water  != null ? `<span class="wb-hist-pill">💧 ${h.water}</span>` : ""}
        ${h.exercise && h.exercise !== "None" ? `<span class="wb-hist-pill">🏃 ${h.exercise}</span>` : ""}
      </div>
      ${h.note ? `<div class="wb-hist-note">${h.note}</div>` : ""}
    </div>
  `).join("");
}

async function generateAiInsight() {
  const btn  = document.getElementById("wbAiBtn");
  const card = document.getElementById("wbAiCard");
  const body = document.getElementById("wbAiBody");
  if (!card || !body) return;

  btn.disabled = true;
  btn.textContent = "✦ Thinking…";
  card.style.display = "block";
  body.innerHTML = `<div style="opacity:0.5;font-style:italic">Analyzing your wellbeing data…</div>`;

  const history = await loadHistory(7).catch(() => []);
  const today   = wbState;

  const moodLabels   = ["","Terrible","Bad","Meh","Okay","Good","Great","Amazing"];
  const energyLabels = ["","Drained","Tired","Low","Okay","Good","Energized"];

  const prompt = `You are a supportive wellbeing coach. Based on this data, write a brief, warm, personalized check-in response.

Today: mood=${moodLabels[today.mood]||"not set"}, energy=${energyLabels[today.energy]||"not set"}, stress=${today.stress||"?"}/5, sleep=${today.sleep}h, water=${today.water} glasses, exercise=${today.exercise}, note="${today.note||"none"}".

Last 7 days trend: ${history.map(h => `${h.date}: mood=${h.mood||"?"}/7 energy=${h.energy||"?"}/6 stress=${h.stress||"?"}/5 sleep=${h.sleep||"?"}h`).join("; ")||"no history yet"}.

Write 3 short paragraphs (no headers, no bullets, plain text):
1. Acknowledge how they're feeling today with empathy
2. One specific observation about their recent trend (positive or constructive)
3. One practical, kind suggestion for today

Keep it under 120 words total. Sound like a caring friend, not a robot.`;

  try {
    const text = await askGemini(prompt, 300);
    body.innerHTML = text.split("\n\n").filter(Boolean)
      .map(p => `<p style="margin:0 0 12px">${p.trim()}</p>`).join("");
  } catch(e) {
    body.innerHTML = `<div style="color:#ef4444">Could not generate insight: ${e.message}</div>`;
  }

  btn.disabled = false;
  btn.textContent = "✦ AI Check-in";
}

// ── Export for report integration ─────────────────────────────
export async function getWellbeingForReport(days = 7) {
  const history = await loadHistory(days).catch(() => []);
  if (!history.length) return null;
  const avg = arr => arr.filter(Boolean).length
    ? (arr.filter(Boolean).reduce((a,b) => a+b, 0) / arr.filter(Boolean).length).toFixed(1)
    : null;
  return {
    avgMood:   avg(history.map(h => h.mood)),
    avgEnergy: avg(history.map(h => h.energy)),
    avgStress: avg(history.map(h => h.stress)),
    avgSleep:  avg(history.map(h => h.sleep)),
    avgWater:  avg(history.map(h => h.water)),
    entries:   history.length,
    latest:    history[history.length - 1]
  };
}