/* ===============================
   WHISPER — Reflection Journal
   with Weekly Theme Insights
================================= */
import { db, auth } from "../firebase/firebaseConfig.js";
import {
  collection, addDoc, getDocs, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let whisperCanvas, wCtx, wAnimFrame, wTime = 0;
let particles = [], textParticles = [];
let whisperState = "idle"; // idle | forming | dissolving
let audioCtx, audioNodes = [];
let selectedMood = "😌";

export function renderWhisper() {
  return `
<div class="whisper-root" id="whisperRoot">
  <canvas id="whisperCanvas" class="whisper-canvas"></canvas>
  <div class="whisper-ui" id="whisperUI">
    <div class="whisper-hero-content">
      <h1 class="whisper-title">Whisper</h1>
      <div id="whisperHeroContent">
      <p class="whisper-tagline">A private space to release what weighs on you<br>or keep what matters most.</p>
      <div class="whisper-hero-btns">
        <button class="whisper-btn whisper-btn-primary" id="whisperBegin">✦ Begin</button>
        <button class="whisper-btn whisper-btn-ghost" id="whisperHistory">🗂 Past Reflections</button>
        <button class="whisper-btn whisper-btn-ghost" id="whisperInsights">✨ Weekly Insights</button>
      </div>
      </div>
    </div>
  </div>

  <!-- WRITE MODAL -->
  <div class="whisper-modal-overlay" id="whisperModal">
    <div class="whisper-beam-box">
      <button class="whisper-modal-close" id="whisperClose">&times;</button>
      <h2 class="whisper-modal-title">What's on your mind?</h2>
      <!-- Mood selector -->
      <div class="whisper-mood-row">
        <span class="whisper-mood-label">Mood</span>
        <div class="whisper-moods">
          ${["😌","😤","😔","😰","🤔","✨"].map(m =>
            `<button class="whisper-mood-btn ${m === "😌" ? "active" : ""}" data-mood="${m}">${m}</button>`
          ).join("")}
        </div>
      </div>
      <textarea id="whisperText" placeholder="Speak freely. No one is watching." rows="5"></textarea>
      <div class="whisper-actions">
        <button class="whisper-release-btn" id="whisperRelease">✦ Release into aurora</button>
        <button class="whisper-save-btn" id="whisperSave">💾 Save reflection</button>
      </div>
    </div>
  </div>

  <!-- HISTORY PANEL -->
  <div class="whisper-history-panel" id="whisperHistoryPanel">
    <div class="whisper-history-header">
      <h3>Past Reflections</h3>
      <button class="modal-close-btn" id="whisperHistoryClose">&times;</button>
    </div>
    <div class="whisper-history-list" id="whisperHistoryList"></div>
  </div>

  <!-- INSIGHTS PANEL -->
  <div class="whisper-history-panel whisper-insights-panel" id="whisperInsightsPanel">
    <div class="whisper-history-header">
      <h3>✨ Weekly Insights</h3>
      <button class="modal-close-btn" id="whisperInsightsClose">&times;</button>
    </div>
    <div class="whisper-insights-body" id="whisperInsightsBody">
      <div class="dash-loading">Analyzing your reflections…</div>
    </div>
  </div>
</div>`;
}

export function initWhisperLogic() {
  whisperCanvas = document.getElementById("whisperCanvas");
  wCtx = whisperCanvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  drawBackground();
  initParticles();
  setupWhisperEvents();
}

export function destroyWhisper() {
  cancelAnimationFrame(wAnimFrame);
  window.removeEventListener("resize", resizeCanvas);
  stopAudio();
}

function resizeCanvas() {
  if (!whisperCanvas) return;
  whisperCanvas.width  = window.innerWidth;
  whisperCanvas.height = window.innerHeight;
}

/* ===================== AURORA BACKGROUND ===================== */
function drawBackground() {
  if (!wCtx || !whisperCanvas) return;
  const w = whisperCanvas.width, h = whisperCanvas.height;
  wCtx.fillStyle = "#020510"; wCtx.fillRect(0, 0, w, h);
  const bands = [
    { c: "rgba(0,245,160,0.18)", s: 0.007, a: 80 },
    { c: "rgba(120,0,255,0.12)", s: 0.011, a: 55 },
    { c: "rgba(0,180,245,0.09)", s: 0.005, a: 95 },
  ];
  bands.forEach((band, bi) => {
    for (let i = 0; i < w; i += 5) {
      const wave = Math.sin(i * 0.003 + wTime * band.s + bi * 1.2) * band.a;
      const y = h * (0.3 + bi * 0.2) + wave;
      const g = wCtx.createLinearGradient(0, y - 100, 0, y + 100);
      g.addColorStop(0, "transparent"); g.addColorStop(0.5, band.c); g.addColorStop(1, "transparent");
      wCtx.fillStyle = g; wCtx.fillRect(i, y - 100, 5, 200);
    }
  });
  drawParticles();
  wTime++;
  wAnimFrame = requestAnimationFrame(drawBackground);
}

/* ===================== AMBIENT PARTICLES ===================== */
function initParticles() {
  if (!whisperCanvas) return;
  particles = Array.from({ length: 40 }, () => ({
    x: Math.random() * whisperCanvas.width,
    y: Math.random() * whisperCanvas.height,
    r: Math.random() * 1.5 + 0.3,
    vy: -(Math.random() * 0.3 + 0.1),
    vx: (Math.random() - 0.5) * 0.2,
    o: Math.random() * 0.3 + 0.05,
    life: Math.random() * 300
  }));
}

function drawParticles() {
  particles.forEach(p => {
    wCtx.beginPath();
    wCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    wCtx.fillStyle = `rgba(0,245,160,${p.o})`;
    wCtx.fill();
    p.x += p.vx; p.y += p.vy; p.life--;
    if (p.life <= 0 || p.y < -10) {
      p.x = Math.random() * whisperCanvas.width;
      p.y = whisperCanvas.height + 5;
      p.life = Math.random() * 300 + 100;
    }
  });
  // Text particles (release animation — word-by-word)
  textParticles = textParticles.filter(tp => tp.o > 0);
  textParticles.forEach(tp => {
    wCtx.save();
    wCtx.globalAlpha = tp.o;
    // Glow effect
    wCtx.shadowColor = "rgba(0,245,160,0.8)";
    wCtx.shadowBlur  = 18;
    wCtx.font        = `300 ${tp.size}px -apple-system, "SF Pro Display", sans-serif`;
    wCtx.fillStyle   = `rgba(0,245,160,${tp.o})`;
    wCtx.textAlign   = "center";
    wCtx.fillText(tp.char, tp.x, tp.y);
    wCtx.restore();
    // Gentle upward drift
    tp.y += tp.vy;
    tp.x += tp.vx;
    tp.o -= 0.0018; // very slow fade (~9 seconds per word)
  });
}

/* ===================== RELEASE ANIMATION ===================== */
function releaseText(text) {
  if (!whisperCanvas) return;
  const cx = whisperCanvas.width / 2;
  const cy = whisperCanvas.height / 2;

  // Break into words and float them in one by one from centre
  const words = text.split(" ").filter(w => w.trim());
  const totalWords = words.length;

  words.forEach((word, i) => {
    setTimeout(() => {
      // Stagger words slightly around center
      const spreadX = (Math.random() - 0.5) * 120;
      const spreadY = (Math.random() - 0.5) * 60;
      textParticles.push({
        char: word,
        x: cx + spreadX,
        y: cy + spreadY + 30,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(Math.random() * 0.5 + 0.15),  // float upward gently
        o: 1.0,
        size: totalWords <= 5 ? 24 : totalWords <= 10 ? 20 : 17
      });
    }, i * 280); // 280ms between each word — readable
  });
}

/* ===================== AUDIO ===================== */
function startAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    [[110, 0.04], [164.8, 0.025], [82.4, 0.02]].forEach(([freq, vol]) => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), filt = audioCtx.createBiquadFilter();
      osc.type = "sine"; osc.frequency.value = freq;
      filt.type = "lowpass"; filt.frequency.value = 500;
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 3);
      osc.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); audioNodes.push({ osc, gain });
    });
  } catch (e) {}
}
function stopAudio() {
  audioNodes.forEach(({ osc, gain }) => {
    try { gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1); setTimeout(() => osc.stop(), 1100); } catch (e) {}
  });
  audioNodes = []; audioCtx = null;
}

/* ===================== HISTORY & INSIGHTS ===================== */
function getUserWhispers() {
  const user = auth.currentUser;
  return collection(db, "users", user.uid, "whispers");
}

async function loadHistory() {
  const q = query(getUserWhispers(), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function openHistory() {
  const panel = document.getElementById("whisperHistoryPanel");
  const list  = document.getElementById("whisperHistoryList");
  panel.classList.add("active");
  const items = await loadHistory();
  if (!items.length) { list.innerHTML = `<p class="whisper-history-empty">No saved reflections yet.<br>Save one to build your journal.</p>`; return; }
  list.innerHTML = items.map(item => {
    const d = item.createdAt ? new Date(item.createdAt.seconds * 1000) : new Date();
    return `
    <div class="whisper-history-item">
      <div class="whisper-history-top">
        <span class="whisper-history-mood">${item.mood || "😌"}</span>
        <span class="whisper-history-date">${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        <button class="whisper-history-del" data-wdel="${item.id}">&times;</button>
      </div>
      <p class="whisper-history-text">${item.text}</p>
    </div>`;
  }).join("");

  list.querySelectorAll("[data-wdel]").forEach(btn => {
    btn.onclick = async () => {
      await deleteDoc(doc(db, "users", auth.currentUser.uid, "whispers", btn.dataset.wdel));
      btn.closest(".whisper-history-item").remove();
    };
  });
}

/* ===================== WEEKLY INSIGHTS ===================== */
async function openInsights() {
  const panel = document.getElementById("whisperInsightsPanel");
  const body  = document.getElementById("whisperInsightsBody");
  panel.classList.add("active");
  body.innerHTML = `<div class="dash-loading">Analyzing your reflections…</div>`;

  const items = await loadHistory();
  const week  = Date.now() - 7 * 86400000;
  const recent = items.filter(i => i.createdAt && i.createdAt.seconds * 1000 > week);

  if (!recent.length) {
    body.innerHTML = `<div class="whisper-insights-empty"><p>Not enough data yet.</p><p style="margin-top:6px;opacity:0.5">Save reflections this week to see patterns.</p></div>`;
    return;
  }

  // Mood breakdown
  const moodCounts = {};
  recent.forEach(i => { moodCounts[i.mood || "😌"] = (moodCounts[i.mood || "😌"] || 0) + 1; });
  const sortedMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
  const topMood = sortedMoods[0]?.[0] || "😌";

  // Theme extraction: common words (naive but effective)
  const stopWords = new Set(["the","a","an","and","or","but","i","you","my","me","it","is","was","to","of","in","that","this","with","for","on","at","be","have","had","not","so","what","just","but","from","by","as","we","can","do","they","all","about","up","out","if","no","there","when","how","him","her","them","then","than","more","some","would","which","who","get","got","its","he","she"]);
  const wordFreq = {};
  recent.forEach(i => {
    (i.text || "").toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).forEach(w => {
      if (w.length > 3 && !stopWords.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
    });
  });
  const themes = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Encouragement based on dominant mood
  const moodMessages = {
    "😌": "You've been mostly at peace this week. That's a superpower.",
    "😤": "You've been channeling frustration — remember, tension can fuel growth.",
    "😔": "It's been a heavy week. Being aware of that is the first step.",
    "😰": "Stress has been present. Notice it, name it, release it.",
    "🤔": "A lot of reflection this week. Clarity tends to follow.",
    "✨": "You've been sparkling. Keep that energy close."
  };

  body.innerHTML = `
    <div class="wi-summary">
      <div class="wi-section">
        <div class="wi-label">This week's reflections</div>
        <div class="wi-big-num">${recent.length}</div>
      </div>
      <div class="wi-section">
        <div class="wi-label">Dominant mood</div>
        <div class="wi-big-mood">${topMood}</div>
      </div>
    </div>
    <div class="wi-message">${moodMessages[topMood] || "You showed up. That matters."}</div>
    <div class="wi-moods">
      <div class="wi-label">Mood breakdown</div>
      <div class="wi-mood-bars">
        ${sortedMoods.map(([mood, count]) => `
          <div class="wi-mood-row">
            <span class="wi-mood-emoji">${mood}</span>
            <div class="wi-mood-bar-wrap">
              <div class="wi-mood-bar" style="width:${Math.round((count / recent.length) * 100)}%"></div>
            </div>
            <span class="wi-mood-count">${count}x</span>
          </div>`).join("")}
      </div>
    </div>
    ${themes.length ? `
    <div class="wi-themes">
      <div class="wi-label">Common themes</div>
      <div class="wi-theme-tags">
        ${themes.map(([word, count]) => `<span class="wi-theme-tag">${word} <span class="wi-tc">${count}</span></span>`).join("")}
      </div>
    </div>` : ""}
  `;
}

/* ===================== EVENTS ===================== */
function setupWhisperEvents() {
  document.getElementById("whisperBegin").onclick = () => {
    document.getElementById("whisperModal").style.display = "flex";
    document.getElementById("whisperModal").style.opacity = "1";
    startAudio();
    setTimeout(() => document.getElementById("whisperText")?.focus(), 200);
  };

  document.getElementById("whisperClose").onclick = () => {
    document.getElementById("whisperModal").style.display = "none";
    stopAudio();
  };

  // Mood selection
  document.querySelectorAll(".whisper-mood-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".whisper-mood-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedMood = btn.dataset.mood;
    };
  });

  // Release — hide EVERYTHING, show pure aurora canvas + floating text only
  document.getElementById("whisperRelease").onclick = () => {
    const text = document.getElementById("whisperText").value.trim();
    if (!text) return;

    // Close modal immediately
    const modal = document.getElementById("whisperModal");
    if (modal) { modal.style.opacity = "0"; setTimeout(() => { modal.style.display = "none"; modal.style.opacity = ""; }, 300); }
    document.getElementById("whisperText").value = "";
    stopAudio();

    // Hide the entire UI layer — only canvas remains
    const ui = document.getElementById("whisperUI");
    if (ui) {
      ui.style.transition = "opacity 0.6s ease";
      ui.style.opacity = "0";
      ui.style.pointerEvents = "none";
    }

    // Small delay then start particles
    setTimeout(() => { releaseText(text); }, 400);

    // Duration: long enough to read + fade (~60ms per char + 6s base)
    const showDuration = Math.max(7000, text.length * 60 + 6000);

    setTimeout(() => {
      // Fade UI back in
      if (ui) {
        ui.style.transition = "opacity 1.2s ease";
        ui.style.opacity = "1";
        ui.style.pointerEvents = "";
      }
    }, showDuration);
  };

  // Save
  document.getElementById("whisperSave").onclick = async () => {
    const text = document.getElementById("whisperText").value.trim();
    if (!text) return;
    const user = auth.currentUser;
    await addDoc(getUserWhispers(), { text, mood: selectedMood, createdAt: serverTimestamp() });
    document.getElementById("whisperModal").style.display = "none";
    document.getElementById("whisperText").value = "";
    stopAudio();
    openHistory();
  };

  // History & insights
  document.getElementById("whisperHistory").onclick  = openHistory;
  document.getElementById("whisperInsights").onclick = openInsights;
  document.getElementById("whisperHistoryClose").onclick  = () => document.getElementById("whisperHistoryPanel").classList.remove("active");
  document.getElementById("whisperInsightsClose").onclick = () => document.getElementById("whisperInsightsPanel").classList.remove("active");
}
