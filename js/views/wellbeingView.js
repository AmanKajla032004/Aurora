import { db, auth } from "../firebase/firebaseConfig.js";
import { askGemini, askGeminiStructured } from "../gemini.js";
import {
  doc, getDoc, setDoc, collection, query,
  orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Data helpers ─────────────────────────────────────────────
function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
async function saveEntry(data) {
  const uid = auth.currentUser?.uid; if (!uid) return;
  await setDoc(doc(db,"wellbeing",uid,"entries",localDateKey()),
    { ...data, date: localDateKey(), savedAt: serverTimestamp() }, { merge: true });
}
async function loadTodayEntry() {
  const uid = auth.currentUser?.uid; if (!uid) return null;
  const snap = await getDoc(doc(db,"wellbeing",uid,"entries",localDateKey()));
  return snap.exists() ? snap.data() : null;
}
async function loadHistory(n = 14) {
  const uid = auth.currentUser?.uid; if (!uid) return [];
  const q = query(collection(db,"wellbeing",uid,"entries"), orderBy("date","desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data()).reverse();
}

// ── Constants ────────────────────────────────────────────────
const MOOD_OPTS = [
  { v:1, e:"😩", l:"Terrible", tip:"Really rough day" },
  { v:2, e:"😔", l:"Bad",      tip:"Below average"    },
  { v:3, e:"😐", l:"Meh",      tip:"Just getting by"  },
  { v:4, e:"🙂", l:"Okay",     tip:"Decent day"       },
  { v:5, e:"😊", l:"Good",     tip:"Feeling solid"    },
  { v:6, e:"😄", l:"Great",    tip:"Really good day"  },
  { v:7, e:"🤩", l:"Amazing",  tip:"On top of the world" }
];
const ENERGY_OPTS = [
  { v:1, e:"🪫", l:"Drained",   tip:"Running on empty"  },
  { v:2, e:"😴", l:"Tired",     tip:"Could use rest"    },
  { v:3, e:"🐢", l:"Low",       tip:"Slow but moving"   },
  { v:4, e:"⚡", l:"Okay",      tip:"Getting things done"},
  { v:5, e:"🔋", l:"Good",      tip:"Feeling capable"   },
  { v:6, e:"🚀", l:"Energized", tip:"Firing on all cylinders" }
];
const STRESS_OPTS = [
  { v:1, l:"Calm",        c:"#22c55e", e:"😌" },
  { v:2, l:"Mild",        c:"#84cc16", e:"🙂" },
  { v:3, l:"Moderate",    c:"#f59e0b", e:"😤" },
  { v:4, l:"High",        c:"#f97316", e:"😰" },
  { v:5, l:"Overwhelmed", c:"#ef4444", e:"🤯" }
];
const EXERCISE_OPTS = [
  { v:"None",       e:"🛋️" },
  { v:"Walk",       e:"🚶" },
  { v:"Workout",    e:"💪" },
  { v:"Sport",      e:"⚽" },
  { v:"Yoga",       e:"🧘" },
  { v:"Meditation", e:"🧠" }
];

// ── Render ───────────────────────────────────────────────────
export function renderWellbeing() {
  const now   = new Date();
  const today = now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  const hour  = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return `<div class="wb3-page" id="wellbeingPage">

  <!-- Header -->
  <div class="wb3-header">
    <div class="wb3-header-text">
      <h1 class="wb3-title">Wellbeing</h1>
      <div class="wb3-subtitle">${greeting} · ${today}</div>
    </div>
    <div class="wb3-header-actions">
      <div class="wb3-streak-badge" id="wbStreakBadge" style="display:none">
        <span>🔥</span><span id="wbStreakNum">0</span><span class="wb3-streak-lbl">day streak</span>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="wb3-tabs">
    <button class="wb3-tab active" data-tab="checkin">
      <span class="wb3-tab-icon">✏️</span>
      <span class="wb3-tab-lbl">Check-in</span>
    </button>
    <button class="wb3-tab" data-tab="trends">
      <span class="wb3-tab-icon">📊</span>
      <span class="wb3-tab-lbl">Trends</span>
    </button>
    <button class="wb3-tab" data-tab="swot">
      <span class="wb3-tab-icon">🧠</span>
      <span class="wb3-tab-lbl">AI Analysis</span>
    </button>
  </div>

  <!-- ══ CHECK-IN TAB ══ -->
  <div class="wb3-panel" id="wbTabCheckin">

    <!-- Saved indicator banner -->
    <div class="wb3-saved-banner" id="wbSavedBanner" style="display:none">
      <span>✓ Today's check-in is saved</span>
      <button class="wb3-saved-edit" id="wbEditBtn">Edit</button>
    </div>

    <!-- Mood -->
    <div class="wb3-card" id="wbMoodCard">
      <div class="wb3-card-header">
        <div class="wb3-card-label">
          <span class="wb3-card-icon">💭</span>
          <div>
            <div class="wb3-card-title">How are you feeling?</div>
            <div class="wb3-card-hint">Your overall mood right now</div>
          </div>
        </div>
        <div class="wb3-selected-tag" id="moodTag" style="display:none"></div>
      </div>
      <div class="wb3-emoji-row" id="wbMoodRow">
        ${MOOD_OPTS.map(o => `
          <button class="wb3-emoji-btn" data-group="mood" data-val="${o.v}" title="${o.tip}">
            <span class="wb3-emoji">${o.e}</span>
            <span class="wb3-emoji-lbl">${o.l}</span>
          </button>`).join("")}
      </div>
    </div>

    <!-- Energy -->
    <div class="wb3-card" id="wbEnergyCard">
      <div class="wb3-card-header">
        <div class="wb3-card-label">
          <span class="wb3-card-icon">⚡</span>
          <div>
            <div class="wb3-card-title">Energy level</div>
            <div class="wb3-card-hint">How much fuel do you have today?</div>
          </div>
        </div>
        <div class="wb3-selected-tag" id="energyTag" style="display:none"></div>
      </div>
      <div class="wb3-emoji-row" id="wbEnergyRow">
        ${ENERGY_OPTS.map(o => `
          <button class="wb3-emoji-btn" data-group="energy" data-val="${o.v}" title="${o.tip}">
            <span class="wb3-emoji">${o.e}</span>
            <span class="wb3-emoji-lbl">${o.l}</span>
          </button>`).join("")}
      </div>
    </div>

    <!-- Stress -->
    <div class="wb3-card" id="wbStressCard">
      <div class="wb3-card-header">
        <div class="wb3-card-label">
          <span class="wb3-card-icon">🌡️</span>
          <div>
            <div class="wb3-card-title">Stress level</div>
            <div class="wb3-card-hint">How much pressure are you under?</div>
          </div>
        </div>
        <div class="wb3-selected-tag" id="stressTag" style="display:none"></div>
      </div>
      <div class="wb3-stress-row">
        ${STRESS_OPTS.map(s => `
          <button class="wb3-stress-btn" data-val="${s.v}" style="--sc:${s.c}" title="${s.l}">
            <span class="wb3-stress-emoji">${s.e}</span>
            <span class="wb3-stress-bar-wrap"><span class="wb3-stress-bar" style="height:${s.v * 18}%"></span></span>
            <span class="wb3-stress-lbl">${s.l}</span>
          </button>`).join("")}
      </div>
    </div>

    <!-- Sleep + Water (2-col) -->
    <div class="wb3-row-2">

      <div class="wb3-card">
        <div class="wb3-card-header">
          <div class="wb3-card-label">
            <span class="wb3-card-icon">💤</span>
            <div>
              <div class="wb3-card-title">Sleep</div>
              <div class="wb3-card-hint">Hours last night</div>
            </div>
          </div>
          <div class="wb3-sleep-reading">
            <span id="sleepVal">7</span><span class="wb3-sleep-unit">h</span>
          </div>
        </div>
        <input type="range" class="wb3-slider" id="sleepSlider" min="0" max="12" step="0.5" value="7">
        <div class="wb3-sleep-scale">
          <span>0h</span><span>3h</span><span>6h</span><span>9h</span><span>12h</span>
        </div>
        <div class="wb3-sleep-feedback" id="sleepFeedback">Good amount of sleep ✓</div>
      </div>

      <div class="wb3-card">
        <div class="wb3-card-header">
          <div class="wb3-card-label">
            <span class="wb3-card-icon">💧</span>
            <div>
              <div class="wb3-card-title">Water</div>
              <div class="wb3-card-hint">Glasses today</div>
            </div>
          </div>
          <div class="wb3-water-count"><span id="waterVal">6</span><span class="wb3-sleep-unit"> / 8</span></div>
        </div>
        <div class="wb3-water-track" id="waterGrid"></div>
        <div class="wb3-water-feedback" id="waterFeedback">Almost there — 2 more glasses</div>
      </div>

    </div>

    <!-- Movement -->
    <div class="wb3-card">
      <div class="wb3-card-header">
        <div class="wb3-card-label">
          <span class="wb3-card-icon">🏃</span>
          <div>
            <div class="wb3-card-title">Movement</div>
            <div class="wb3-card-hint">Any physical activity today?</div>
          </div>
        </div>
        <div class="wb3-selected-tag" id="exerciseTag" style="display:none"></div>
      </div>
      <div class="wb3-ex-row">
        ${EXERCISE_OPTS.map(o => `
          <button class="wb3-ex-btn" data-val="${o.v}">
            <span class="wb3-ex-icon">${o.e}</span>
            <span class="wb3-ex-lbl">${o.v}</span>
          </button>`).join("")}
      </div>
    </div>

    <!-- Note -->
    <div class="wb3-card">
      <div class="wb3-card-header">
        <div class="wb3-card-label">
          <span class="wb3-card-icon">📝</span>
          <div>
            <div class="wb3-card-title">Today's note <span class="wb3-optional">optional</span></div>
            <div class="wb3-card-hint">Anything on your mind worth capturing?</div>
          </div>
        </div>
      </div>
      <textarea class="wb3-note" id="wbNote"
        placeholder="Any wins, worries, or reflections from today…" rows="3"></textarea>
    </div>

    <!-- Save -->
    <button class="wb3-save-btn" id="wbSaveBtn">Save today's check-in</button>
    <div class="wb3-save-msg" id="wbSaveMsg"></div>

    <!-- AI Insight -->
    <div class="wb3-ai-card" id="wbAiCard" style="display:none">
      <div class="wb3-ai-header">
        <span class="wb3-ai-label">✦ AI Wellbeing Insight</span>
        <button class="wb3-ai-regen" id="wbAiRegen">↻ Refresh</button>
      </div>
      <div class="wb3-ai-body" id="wbAiBody"></div>
    </div>

    <!-- AI trigger (shown after save) -->
    <button class="wb3-ai-trigger" id="wbAiBtn" style="display:none">
      ✦ Get AI insight for today
    </button>

  </div>

  <!-- ══ TRENDS TAB ══ -->
  <div class="wb3-panel" id="wbTabTrends" style="display:none">

    <!-- Period selector -->
    <div class="wb3-period-row">
      <span class="wb3-period-lbl">Last</span>
      <div class="wb3-period-btns">
        <button class="wb3-period-btn active" data-days="7">7 days</button>
        <button class="wb3-period-btn" data-days="14">14 days</button>
        <button class="wb3-period-btn" data-days="30">30 days</button>
      </div>
    </div>

    <!-- Score cards row -->
    <div class="wb3-score-row" id="wbScoreRow">
      <div class="wb3-score-card loading"><div class="wb3-score-shimmer"></div></div>
      <div class="wb3-score-card loading"><div class="wb3-score-shimmer"></div></div>
      <div class="wb3-score-card loading"><div class="wb3-score-shimmer"></div></div>
      <div class="wb3-score-card loading"><div class="wb3-score-shimmer"></div></div>
    </div>

    <!-- Insight callout -->
    <div class="wb3-insight-callout" id="wbInsightCallout" style="display:none">
      <span class="wb3-insight-icon" id="wbInsightIcon">💡</span>
      <div class="wb3-insight-content">
        <div class="wb3-insight-headline" id="wbInsightHeadline"></div>
        <div class="wb3-insight-body" id="wbInsightBody"></div>
      </div>
    </div>

    <!-- Charts: single full-width mood + energy/stress side by side -->
    <div class="wb3-charts-wrap">
      <div class="wb3-chart-card wb3-chart-wide">
        <div class="wb3-chart-header">
          <div class="wb3-chart-name">😊 Mood &amp; ⚡ Energy</div>
          <div class="wb3-chart-meta" id="moodEnergyMeta"></div>
        </div>
        <div class="wb3-chart-area"><canvas id="chartMoodEnergy"></canvas></div>
      </div>
      <div class="wb3-charts-duo">
        <div class="wb3-chart-card">
          <div class="wb3-chart-header">
            <div class="wb3-chart-name">😰 Stress</div>
            <div class="wb3-chart-meta" id="stressMeta"></div>
          </div>
          <div class="wb3-chart-area"><canvas id="chartStress"></canvas></div>
          <div class="wb3-chart-foot">1 = Calm · 5 = Overwhelmed</div>
        </div>
        <div class="wb3-chart-card">
          <div class="wb3-chart-header">
            <div class="wb3-chart-name">💤 Sleep</div>
            <div class="wb3-chart-meta" id="sleepMeta"></div>
          </div>
          <div class="wb3-chart-area"><canvas id="chartSleep"></canvas></div>
          <div class="wb3-chart-foot">Goal: 7–9 hours</div>
        </div>
      </div>
    </div>

    <!-- Log -->
    <div class="wb3-log-card">
      <div class="wb3-log-header">
        <span class="wb3-log-title">Recent entries</span>
        <span class="wb3-log-count" id="wbLogCount"></span>
      </div>
      <div class="wb3-log-list" id="wbLogList">
        <div class="wb3-empty">No check-ins yet — save today's first.</div>
      </div>
    </div>

  </div>

  <!-- ══ AI ANALYSIS TAB ══ -->
  <div class="wb3-panel" id="wbTabSwot" style="display:none">
    <div class="wb3-analysis-intro" id="wbSwotIntro">
      <div class="wb3-analysis-icon">🧠</div>
      <div class="wb3-analysis-heading">Personal Wellbeing Analysis</div>
      <div class="wb3-analysis-desc">
        AI looks at your check-in history to identify your strengths, stressors,
        patterns, and give you a concrete action plan for the week ahead.
      </div>
      <button class="wb3-generate-btn" id="wbSwotBtn">Generate my analysis</button>
    </div>
    <div id="wbSwotResult" style="display:none">
      <div class="wb3-swot-grid">
        <div class="wb3-swot-q wb3-swot-s">
          <div class="wb3-swot-q-head">💪 What's working</div>
          <div class="wb3-swot-q-body" id="wbSwotS"></div>
        </div>
        <div class="wb3-swot-q wb3-swot-w">
          <div class="wb3-swot-q-head">⚠️ What's draining you</div>
          <div class="wb3-swot-q-body" id="wbSwotW"></div>
        </div>
        <div class="wb3-swot-q wb3-swot-o">
          <div class="wb3-swot-q-head">🌱 Opportunities</div>
          <div class="wb3-swot-q-body" id="wbSwotO"></div>
        </div>
        <div class="wb3-swot-q wb3-swot-t">
          <div class="wb3-swot-q-head">🔥 Watch out for</div>
          <div class="wb3-swot-q-body" id="wbSwotT"></div>
        </div>
      </div>
      <div class="wb3-action-plan" id="wbSwotSummary"></div>
      <button class="wb3-regen-btn" id="wbSwotRegen">↻ Regenerate analysis</button>
    </div>
  </div>

</div>`;
}

// ── State ────────────────────────────────────────────────────
let wbState = { mood:null, energy:null, stress:null, sleep:7, water:6, exercise:"None", note:"" };
let trendsHistory = [];
let trendsDays    = 7;

export async function initWellbeing() {
  wbState = { mood:null, energy:null, stress:null, sleep:7, water:6, exercise:"None", note:"" };

  // Load today & streak in parallel
  const [today, history] = await Promise.all([
    loadTodayEntry().catch(() => null),
    loadHistory(30).catch(() => [])
  ]);

  // Streak calculation
  const streak = calcStreak(history);
  if (streak > 0) {
    document.getElementById("wbStreakBadge").style.display = "flex";
    document.getElementById("wbStreakNum").textContent = streak;
  }

  if (today) {
    applyState(today);
    showSavedBanner(true);
  } else {
    renderWaterGrid(wbState.water);
    updateSleepFeedback(wbState.sleep);
    showSavedBanner(false);
  }

  // Tab switching
  document.querySelectorAll(".wb3-tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".wb3-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".wb3-panel").forEach(p => p.style.display = "none");
      const key     = tab.dataset.tab;
      const panelId = "wbTab" + key.charAt(0).toUpperCase() + key.slice(1);
      const panel   = document.getElementById(panelId);
      if (panel) panel.style.display = "flex";
      if (key === "trends") loadAndRenderTrends(trendsDays);
    };
  });

  // Edit button (re-enables form after save)
  document.getElementById("wbEditBtn").onclick = () => showSavedBanner(false);

  // Mood
  document.querySelectorAll(".wb3-emoji-btn[data-group='mood']").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".wb3-emoji-btn[data-group='mood']").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      wbState.mood = parseInt(btn.dataset.val);
      const opt = MOOD_OPTS.find(o => o.v === wbState.mood);
      setSelectedTag("moodTag", opt?.e + " " + opt?.l);
    };
  });

  // Energy
  document.querySelectorAll(".wb3-emoji-btn[data-group='energy']").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".wb3-emoji-btn[data-group='energy']").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      wbState.energy = parseInt(btn.dataset.val);
      const opt = ENERGY_OPTS.find(o => o.v === wbState.energy);
      setSelectedTag("energyTag", opt?.e + " " + opt?.l);
    };
  });

  // Stress
  document.querySelectorAll(".wb3-stress-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".wb3-stress-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      wbState.stress = parseInt(btn.dataset.val);
      const opt = STRESS_OPTS.find(o => o.v === wbState.stress);
      setSelectedTag("stressTag", opt?.e + " " + opt?.l);
    };
  });

  // Sleep slider
  const sleepSlider = document.getElementById("sleepSlider");
  if (sleepSlider) {
    sleepSlider.oninput = () => {
      wbState.sleep = parseFloat(sleepSlider.value);
      document.getElementById("sleepVal").textContent = wbState.sleep;
      updateSleepFeedback(wbState.sleep);
    };
  }

  // Water grid
  renderWaterGrid(wbState.water);

  // Movement
  document.querySelectorAll(".wb3-ex-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".wb3-ex-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      wbState.exercise = btn.dataset.val;
      setSelectedTag("exerciseTag", btn.querySelector(".wb3-ex-icon").textContent + " " + btn.dataset.val);
    };
  });

  // Save
  document.getElementById("wbSaveBtn").onclick = async () => {
    const btn = document.getElementById("wbSaveBtn");
    const msg = document.getElementById("wbSaveMsg");
    wbState.note = document.getElementById("wbNote")?.value.trim() || "";
    if (!wbState.mood && !wbState.energy) {
      showSaveMsg("Select at least your mood or energy to save.", "warn");
      return;
    }
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await saveEntry(wbState);
      showSaveMsg("✓ Check-in saved!", "ok");
      showSavedBanner(true);
      // Show AI trigger after save
      document.getElementById("wbAiBtn").style.display = "block";
    } catch(e) {
      showSaveMsg("Failed to save: " + e.message, "err");
    }
    btn.disabled = false; btn.textContent = "Save today's check-in";
  };

  // AI insight
  document.getElementById("wbAiBtn").onclick   = generateAiInsight;
  document.getElementById("wbAiRegen").onclick  = generateAiInsight;

  // SWOT
  document.getElementById("wbSwotBtn").onclick   = generateSwot;
  document.getElementById("wbSwotRegen")?.addEventListener("click", generateSwot);

  // Trends period buttons
  document.querySelectorAll(".wb3-period-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".wb3-period-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      trendsDays = parseInt(btn.dataset.days);
      loadAndRenderTrends(trendsDays);
    };
  });

  // If today's entry exists, show AI trigger
  if (today) document.getElementById("wbAiBtn").style.display = "block";
}

// ── Helpers ──────────────────────────────────────────────────
function setSelectedTag(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.display = "inline-flex";
}

function showSavedBanner(saved) {
  const banner  = document.getElementById("wbSavedBanner");
  const saveBtn = document.getElementById("wbSaveBtn");
  const inputs  = document.querySelector(".wb3-panel#wbTabCheckin");
  if (!banner) return;
  if (saved) {
    banner.style.display = "flex";
    if (saveBtn) { saveBtn.style.opacity = "0.45"; saveBtn.disabled = true; }
    // visually dim cards (but don't disable inputs — edit btn re-enables)
  } else {
    banner.style.display = "none";
    if (saveBtn) { saveBtn.style.opacity = ""; saveBtn.disabled = false; }
  }
}

function showSaveMsg(text, type) {
  const msg = document.getElementById("wbSaveMsg");
  if (!msg) return;
  msg.textContent = text;
  msg.className = "wb3-save-msg wb3-save-" + type;
  setTimeout(() => { if (msg) msg.textContent = ""; }, 3500);
}

function updateSleepFeedback(hours) {
  const el = document.getElementById("sleepFeedback");
  if (!el) return;
  if (hours < 5)        { el.textContent = "⚠ Very low — try to rest more"; el.className = "wb3-sleep-feedback bad"; }
  else if (hours < 6.5) { el.textContent = "Below recommended (7–9h)";      el.className = "wb3-sleep-feedback warn"; }
  else if (hours <= 9)  { el.textContent = "✓ Good amount of sleep";         el.className = "wb3-sleep-feedback ok"; }
  else                  { el.textContent = "A bit over — 7–9h is ideal";     el.className = "wb3-sleep-feedback warn"; }
}

function updateWaterFeedback(glasses) {
  const el = document.getElementById("waterFeedback");
  if (!el) return;
  if (glasses >= 8)     { el.textContent = "✓ Great hydration today!";               el.className = "wb3-water-feedback ok"; }
  else if (glasses >= 6){ el.textContent = `Almost there — ${8-glasses} more glasses`; el.className = "wb3-water-feedback warn"; }
  else if (glasses >= 4){ el.textContent = `${8-glasses} more glasses to reach goal`; el.className = "wb3-water-feedback warn"; }
  else                  { el.textContent = "Drink more water today";                  el.className = "wb3-water-feedback bad"; }
}

function renderWaterGrid(current) {
  const grid = document.getElementById("waterGrid");
  if (!grid) return;
  const goal = 8; const max = 10;
  grid.innerHTML = Array.from({length: max}, (_, i) => {
    const filled = i < current;
    const isGoal = i === goal - 1; // 8th cup is the goal marker
    return `<button class="wb3-water-drop ${filled?"filled":""} ${isGoal?"goal-marker":""}"
      data-idx="${i}" title="${i+1} glass${i>0?"es":""}">
      <span class="wb3-drop-icon">${filled ? "💧" : "○"}</span>
    </button>`;
  }).join("");
  grid.querySelectorAll(".wb3-water-drop").forEach(cup => {
    cup.onclick = () => {
      const idx = parseInt(cup.dataset.idx);
      const newVal = (idx + 1 === wbState.water) ? idx : idx + 1;
      wbState.water = newVal;
      document.getElementById("waterVal").textContent = newVal;
      renderWaterGrid(newVal);
      updateWaterFeedback(newVal);
    };
  });
  updateWaterFeedback(current);
}

function calcStreak(history) {
  if (!history.length) return 0;
  const today = localDateKey();
  const set   = new Set(history.map(h => h.date));
  let streak  = 0;
  let d       = new Date();
  // Allow today OR yesterday as starting point
  if (!set.has(today)) d.setDate(d.getDate() - 1);
  while (true) {
    const key = localDateKey(d);
    if (!set.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
    if (streak > 365) break;
  }
  return streak;
}

function applyState(entry) {
  wbState = { ...wbState, ...entry };
  if (entry.mood) {
    const btn = document.querySelector(`.wb3-emoji-btn[data-group="mood"][data-val="${entry.mood}"]`);
    if (btn) btn.classList.add("active");
    const opt = MOOD_OPTS.find(o => o.v === entry.mood);
    setSelectedTag("moodTag", opt?.e + " " + opt?.l);
  }
  if (entry.energy) {
    const btn = document.querySelector(`.wb3-emoji-btn[data-group="energy"][data-val="${entry.energy}"]`);
    if (btn) btn.classList.add("active");
    const opt = ENERGY_OPTS.find(o => o.v === entry.energy);
    setSelectedTag("energyTag", opt?.e + " " + opt?.l);
  }
  if (entry.stress) {
    const btn = document.querySelector(`.wb3-stress-btn[data-val="${entry.stress}"]`);
    if (btn) btn.classList.add("active");
    const opt = STRESS_OPTS.find(o => o.v === entry.stress);
    setSelectedTag("stressTag", opt?.e + " " + opt?.l);
  }
  if (entry.sleep != null) {
    const sl = document.getElementById("sleepSlider");
    if (sl) sl.value = entry.sleep;
    const sv = document.getElementById("sleepVal");
    if (sv) sv.textContent = entry.sleep;
    updateSleepFeedback(entry.sleep);
  }
  if (entry.water != null) {
    const wv = document.getElementById("waterVal");
    if (wv) wv.textContent = entry.water;
    renderWaterGrid(entry.water);
  }
  if (entry.exercise) {
    const btn = document.querySelector(`.wb3-ex-btn[data-val="${entry.exercise}"]`);
    if (btn) {
      btn.classList.add("active");
      setSelectedTag("exerciseTag",
        btn.querySelector(".wb3-ex-icon").textContent + " " + entry.exercise);
    }
  }
  const noteEl = document.getElementById("wbNote");
  if (noteEl && entry.note) noteEl.value = entry.note;
}

// ── Trends ───────────────────────────────────────────────────
async function loadAndRenderTrends(days = 7) {
  trendsHistory = await loadHistory(days).catch(() => []);

  if (!trendsHistory.length) {
    document.getElementById("wbScoreRow").innerHTML =
      `<div class="wb3-empty" style="grid-column:1/-1;padding:20px 0">No check-ins yet — complete today's check-in first.</div>`;
    return;
  }

  const avg = arr => {
    const v = arr.filter(x => x != null && x > 0);
    return v.length ? v.reduce((a,b) => a+b, 0) / v.length : null;
  };
  const moodAvg   = avg(trendsHistory.map(h => h.mood));
  const energyAvg = avg(trendsHistory.map(h => h.energy));
  const stressAvg = avg(trendsHistory.map(h => h.stress));
  const sleepAvg  = avg(trendsHistory.map(h => h.sleep));
  const waterAvg  = avg(trendsHistory.map(h => h.water));

  // Score cards
  renderScoreCards(moodAvg, energyAvg, stressAvg, sleepAvg);

  // Smart insight
  renderInsight(moodAvg, energyAvg, stressAvg, sleepAvg, waterAvg, trendsHistory);

  // Charts
  renderTrendCharts(trendsHistory);

  // Log
  renderLogList(trendsHistory);
}

function renderScoreCards(moodAvg, energyAvg, stressAvg, sleepAvg) {
  const row = document.getElementById("wbScoreRow");
  if (!row) return;

  const card = (icon, label, val, max, suffix, goodFn, desc) => {
    if (val == null) return `<div class="wb3-score-card na">
      <div class="wb3-score-icon">${icon}</div>
      <div class="wb3-score-num">—</div>
      <div class="wb3-score-label">${label}</div>
      <div class="wb3-score-desc">No data</div>
    </div>`;

    const pct   = (val - 1) / (max - 1); // normalise 0–1
    const score = goodFn(val);            // "good"|"ok"|"bad"
    const color = score === "good" ? "#22c55e" : score === "ok" ? "#f59e0b" : "#ef4444";
    const disp  = val.toFixed(1) + suffix;

    return `<div class="wb3-score-card ${score}" style="--sc:${color}">
      <div class="wb3-score-icon">${icon}</div>
      <div class="wb3-score-num">${disp}</div>
      <div class="wb3-score-label">${label}</div>
      <div class="wb3-score-bar"><div class="wb3-score-fill" style="width:${Math.round(pct*100)}%"></div></div>
      <div class="wb3-score-desc">${desc(val)}</div>
    </div>`;
  };

  row.innerHTML =
    card("😊", "Mood",   moodAvg,   7, "/7",
      v => v >= 5 ? "good" : v >= 3.5 ? "ok" : "bad",
      v => v >= 5.5 ? "Feeling good" : v >= 4 ? "Getting by" : "Could be better") +
    card("⚡", "Energy", energyAvg, 6, "/6",
      v => v >= 4 ? "good" : v >= 2.5 ? "ok" : "bad",
      v => v >= 4.5 ? "Good energy" : v >= 3 ? "Moderate" : "Running low") +
    card("😰", "Stress", stressAvg, 5, "/5",
      v => v <= 2 ? "good" : v <= 3.5 ? "ok" : "bad",
      v => v <= 2 ? "Well managed" : v <= 3 ? "Moderate" : "High — keep an eye on this") +
    card("💤", "Sleep",  sleepAvg,  12,"h",
      v => v >= 7 && v <= 9 ? "good" : v >= 6 ? "ok" : "bad",
      v => v >= 7 ? "Good sleep" : v >= 6 ? "Slightly low" : "Not enough rest");
}

function renderInsight(moodAvg, energyAvg, stressAvg, sleepAvg, waterAvg, history) {
  const callout  = document.getElementById("wbInsightCallout");
  const headline = document.getElementById("wbInsightHeadline");
  const body     = document.getElementById("wbInsightBody");
  if (!callout || !history.length) return;

  const insights = [];

  // Sleep-stress correlation
  if (stressAvg != null && sleepAvg != null && stressAvg >= 3.5 && sleepAvg < 7)
    insights.push({ icon:"🔗", hl:"Sleep & stress are connected",
      body:`You're averaging ${sleepAvg.toFixed(1)}h sleep and stress of ${stressAvg.toFixed(1)}/5 — these often fuel each other. Even one extra hour can make a difference.` });

  // Positive streak
  if (moodAvg != null && moodAvg >= 5.5 && energyAvg != null && energyAvg >= 4.5)
    insights.push({ icon:"🌟", hl:"You're in a great run",
      body:`Mood ${moodAvg.toFixed(1)}/7 and energy ${energyAvg.toFixed(1)}/6 — both strong. This is the time to tackle hard things and build momentum.` });

  // Low energy + good sleep = other cause
  if (energyAvg != null && energyAvg < 3 && sleepAvg != null && sleepAvg >= 7)
    insights.push({ icon:"🤔", hl:"Low energy despite good sleep",
      body:`You're sleeping ${sleepAvg.toFixed(1)}h but energy is only ${energyAvg.toFixed(1)}/6. This could point to nutrition, hydration, or mental load rather than rest.` });

  // Dehydration risk
  if (waterAvg != null && waterAvg < 5)
    insights.push({ icon:"💧", hl:"Low hydration detected",
      body:`You're averaging ${waterAvg.toFixed(1)} glasses/day — below the 8-glass goal. Dehydration is a hidden driver of low energy and poor mood.` });

  // Stress spike
  if (stressAvg != null && stressAvg > 3.5)
    insights.push({ icon:"⚠️", hl:"Stress needs attention",
      body:`Average stress of ${stressAvg.toFixed(1)}/5 is high. Try identifying the single biggest stressor and either address it or create space away from it.` });

  // General low mood
  if (moodAvg != null && moodAvg < 3.5 && (stressAvg == null || stressAvg < 3))
    insights.push({ icon:"😔", hl:"Mood has been low lately",
      body:`Mood is averaging ${moodAvg.toFixed(1)}/7 without obvious stress — could be energy, isolation, or routine. Small positive changes compound quickly.` });

  // Default positive
  if (!insights.length)
    insights.push({ icon:"✅", hl:"Things look stable",
      body:"No major patterns to flag right now. Keep logging and you'll spot trends over time." });

  const pick = insights[0];
  document.getElementById("wbInsightIcon").textContent    = pick.icon;
  headline.textContent = pick.hl;
  body.textContent     = pick.body;
  callout.style.display = "flex";
}

function renderTrendCharts(history) {
  if (typeof Chart === "undefined") return;
  const dark    = document.body.classList.contains("dark");
  const textCol = dark ? "rgba(203,213,225,0.65)" : "rgba(30,41,59,0.6)";
  const gridCol = dark ? "rgba(255,255,255,0.04)"  : "rgba(0,0,0,0.05)";
  const labels  = history.map(h => {
    const d = new Date(h.date + "T12:00:00");
    return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  });

  const baseOpts = (min, max, suffix, invert) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y ?? "—"}${suffix}` } }
    },
    scales: {
      x: { grid: { color: gridCol }, ticks: { color: textCol, font:{ size:10 }, maxTicksLimit:7 } },
      y: { grid: { color: gridCol }, ticks: { color: textCol, font:{ size:10 }, stepSize:1 }, min, max,
           reverse: invert }
    },
    animation: { duration: 400 }
  });

  // Combined mood + energy chart
  const meEl = document.getElementById("chartMoodEnergy");
  if (meEl) {
    if (Chart.getChart(meEl)) Chart.getChart(meEl).destroy();
    const moodData   = history.map(h => h.mood   || null);
    const energyData = history.map(h => h.energy || null);
    const avgM = moodData.filter(Boolean).reduce((a,b,_,ar) => a+b/ar.length, 0) || null;
    const avgE = energyData.filter(Boolean).reduce((a,b,_,ar) => a+b/ar.length, 0) || null;
    const meta = document.getElementById("moodEnergyMeta");
    if (meta) meta.innerHTML =
      `<span class="wb3-chart-avg mood">${avgM ? avgM.toFixed(1)+"/7" : "—"}</span>` +
      `<span class="wb3-chart-avg energy">${avgE ? avgE.toFixed(1)+"/6" : "—"}</span>`;
    new Chart(meEl, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label:"Mood",   data: moodData,   borderColor:"#00c87a", backgroundColor:"rgba(0,200,122,0.08)",
            borderWidth:2.5, fill:true, tension:0.35, pointBackgroundColor:"#00c87a",
            pointRadius:4, pointHoverRadius:6, spanGaps:true },
          { label:"Energy", data: energyData, borderColor:"#818cf8", backgroundColor:"rgba(129,140,248,0.06)",
            borderWidth:2.5, fill:false, tension:0.35, pointBackgroundColor:"#818cf8",
            pointRadius:4, pointHoverRadius:6, spanGaps:true }
        ]
      },
      options: {
        ...baseOpts(0, 8, "", false),
        plugins: {
          legend: { display:true, position:"top",
            labels: { color:textCol, font:{ size:11 }, boxWidth:12, padding:16 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } }
        }
      }
    });
  }

  // Stress chart (inverted — lower is better)
  const stEl = document.getElementById("chartStress");
  if (stEl) {
    if (Chart.getChart(stEl)) Chart.getChart(stEl).destroy();
    const stData = history.map(h => h.stress || null);
    const avgS   = stData.filter(Boolean).reduce((a,b,_,ar) => a+b/ar.length, 0) || null;
    const meta   = document.getElementById("stressMeta");
    if (meta) {
      const avgEl = document.createElement("span");
      avgEl.className = "wb3-chart-avg " + (avgS <= 2 ? "good" : avgS <= 3 ? "ok" : "bad");
      avgEl.textContent = avgS ? avgS.toFixed(1)+"/5" : "—";
      meta.innerHTML = ""; meta.appendChild(avgEl);
    }
    const ptColors = stData.map(v => {
      if (!v) return "transparent";
      return v <= 2 ? "#22c55e" : v <= 3 ? "#f59e0b" : "#ef4444";
    });
    new Chart(stEl, {
      type: "line",
      data: { labels, datasets: [{ data:stData, borderColor:"#f87171",
        backgroundColor:"rgba(248,113,113,0.08)", borderWidth:2.5, fill:true,
        tension:0.35, pointBackgroundColor:ptColors, pointRadius:4, pointHoverRadius:6, spanGaps:true }] },
      options: baseOpts(0, 6, "/5", false)
    });
  }

  // Sleep chart with reference band
  const slEl = document.getElementById("chartSleep");
  if (slEl) {
    if (Chart.getChart(slEl)) Chart.getChart(slEl).destroy();
    const slData = history.map(h => h.sleep || null);
    const avgSl  = slData.filter(Boolean).reduce((a,b,_,ar) => a+b/ar.length, 0) || null;
    const meta   = document.getElementById("sleepMeta");
    if (meta) {
      const avgEl = document.createElement("span");
      avgEl.className = "wb3-chart-avg " + (avgSl >= 7 ? "good" : avgSl >= 6 ? "ok" : "bad");
      avgEl.textContent = avgSl ? avgSl.toFixed(1)+"h" : "—";
      meta.innerHTML = ""; meta.appendChild(avgEl);
    }
    new Chart(slEl, {
      type: "line",
      data: { labels, datasets: [{ data:slData, borderColor:"#00d9f5",
        backgroundColor:"rgba(0,217,245,0.08)", borderWidth:2.5, fill:true,
        tension:0.35, pointBackgroundColor:"#00d9f5", pointRadius:4, pointHoverRadius:6, spanGaps:true }] },
      options: baseOpts(0, 13, "h", false)
    });
  }
}

function renderLogList(history) {
  const list  = document.getElementById("wbLogList");
  const count = document.getElementById("wbLogCount");
  if (!list) return;
  if (count) count.textContent = `${history.length} entries`;

  const moodE   = ["","😩","😔","😐","🙂","😊","😄","🤩"];
  const energyE = ["","🪫","😴","🐢","⚡","🔋","🚀"];
  const stressC = ["","#22c55e","#84cc16","#f59e0b","#f97316","#ef4444"];
  const stressL = ["","Calm","Mild","Moderate","High","Overwhelmed"];

  list.innerHTML = [...history].reverse().map(h => {
    const date = new Date(h.date + "T12:00:00")
      .toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
    return `<div class="wb3-log-row">
      <div class="wb3-log-date">${date}</div>
      <div class="wb3-log-chips">
        ${h.mood   ? `<span class="wb3-chip" title="Mood">${moodE[h.mood]} ${MOOD_OPTS.find(o=>o.v===h.mood)?.l||""}</span>` : ""}
        ${h.energy ? `<span class="wb3-chip" title="Energy">${energyE[h.energy]} ${ENERGY_OPTS.find(o=>o.v===h.energy)?.l||""}</span>` : ""}
        ${h.stress ? `<span class="wb3-chip stress-chip" style="--sc:${stressC[h.stress]}" title="Stress">${stressL[h.stress]}</span>` : ""}
        ${h.sleep  != null ? `<span class="wb3-chip dim">💤 ${h.sleep}h</span>` : ""}
        ${h.water  != null ? `<span class="wb3-chip dim">💧 ${h.water}</span>` : ""}
        ${h.exercise && h.exercise !== "None" ? `<span class="wb3-chip dim">🏃 ${h.exercise}</span>` : ""}
      </div>
      ${h.note ? `<div class="wb3-log-note">${h.note}</div>` : ""}
    </div>`;
  }).join("");
}

// ── AI Insight ───────────────────────────────────────────────
async function generateAiInsight() {
  const btn  = document.getElementById("wbAiBtn");
  const card = document.getElementById("wbAiCard");
  const body = document.getElementById("wbAiBody");
  if (!card || !body) return;

  btn.disabled = true; btn.textContent = "✦ Thinking…";
  card.style.display = "block";
  body.innerHTML = `<div class="wb3-ai-loading"><span class="wb3-ai-dots"></span> Analyzing your data…</div>`;

  const history = await loadHistory(7).catch(() => []);

  const moodLbls = ["","Terrible","Bad","Meh","Okay","Good","Great","Amazing"];
  const enLbls   = ["","Drained","Tired","Low","Okay","Good","Energized"];
  const stLbls   = ["","Calm","Mild","Moderate","High","Overwhelmed"];

  const todayParts = [
    wbState.mood   ? `mood: ${moodLbls[wbState.mood]} (${wbState.mood}/7)` : null,
    wbState.energy ? `energy: ${enLbls[wbState.energy]} (${wbState.energy}/6)` : null,
    wbState.stress ? `stress: ${stLbls[wbState.stress]} (${wbState.stress}/5)` : null,
    `sleep: ${wbState.sleep}h`, `water: ${wbState.water} glasses`,
    wbState.exercise !== "None" ? `movement: ${wbState.exercise}` : null,
    wbState.note ? `note: "${wbState.note}"` : null
  ].filter(Boolean).join(", ");

  const recent = history.slice(-5).map(h =>
    `${h.date.slice(5)}: mood ${h.mood||"?"}/7, stress ${h.stress||"?"}/5, sleep ${h.sleep||"?"}h, energy ${h.energy||"?"}/6`
  ).join("; ") || "no history yet";

  const avg = arr => { const v=arr.filter(Boolean); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null; };
  const aM=avg(history.map(h=>h.mood)), aSl=avg(history.map(h=>h.sleep)), aSt=avg(history.map(h=>h.stress)), aE=avg(history.map(h=>h.energy));
  const weekSummary = aM ? `7-day averages: mood ${aM}/7, energy ${aE}/6, stress ${aSt}/5, sleep ${aSl}h.` : "";

  const prompt = `You are a perceptive, warm wellbeing coach. Be direct and specific — never generic or preachy.

TODAY: ${todayParts || "no data yet"}
RECENT (5 days): ${recent}
${weekSummary}

Write exactly 3 short paragraphs (no headers, no bullets, ~120 words total):
1. Name how they're actually doing today — use their real numbers, be honest but kind
2. Spot one specific pattern from the data that they might not have noticed (use actual numbers)
3. One concrete, do-able action for tomorrow — tied directly to their weakest metric`;

  try {
    const text = await askGemini(prompt, 350);
    body.innerHTML = text.split("\n\n").filter(Boolean)
      .map(p => `<p>${p.trim()}</p>`).join("");
  } catch(e) {
    body.innerHTML = `<div class="wb3-ai-error">⚠ ${e.message}</div>`;
  }
  btn.disabled = false; btn.textContent = "✦ Get AI insight for today";
}

// ── SWOT ─────────────────────────────────────────────────────
async function generateSwot() {
  const btn    = document.getElementById("wbSwotBtn") || document.getElementById("wbSwotRegen");
  const intro  = document.getElementById("wbSwotIntro");
  const result = document.getElementById("wbSwotResult");
  if (btn) { btn.disabled = true; btn.textContent = "Analyzing…"; }
  if (result) result.style.display = "none";

  const history   = await loadHistory(14).catch(() => []);
  const avg = arr => { const v=arr.filter(Boolean); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null; };
  const avgMood   = avg(history.map(h=>h.mood));
  const avgEnergy = avg(history.map(h=>h.energy));
  const avgStress = avg(history.map(h=>h.stress));
  const avgSleep  = avg(history.map(h=>h.sleep));
  const avgWater  = avg(history.map(h=>h.water));
  const notes     = history.filter(h=>h.note).slice(-4).map(h=>h.note).join("; ") || "none";
  const exerciseCounts = history.reduce((acc,h) => {
    if (h.exercise && h.exercise !== "None") acc[h.exercise] = (acc[h.exercise]||0)+1;
    return acc;
  }, {});
  const topExercise = Object.entries(exerciseCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "None";

  const prompt = `Wellbeing SWOT analysis — be specific, data-driven, and honest. Use actual numbers. No generic advice.
14-day averages: mood ${avgMood||"?"}/7, energy ${avgEnergy||"?"}/6, stress ${avgStress||"?"}/5, sleep ${avgSleep||"?"}h, water ${avgWater||"?"} glasses.
Today: mood=${wbState.mood||"?"}/7, energy=${wbState.energy||"?"}/6, stress=${wbState.stress||"?"}/5, exercise=${wbState.exercise||"None"}.
Most common movement: ${topExercise}. Recent notes: ${notes}.
Return JSON with: strengths (array of 2 specific items), weaknesses (array of 2 specific items), opportunities (array of 2 actionable items), threats (array of 2 specific risks), summary (1-sentence action plan for this week).`;

  try {
    const data = await askGeminiStructured(prompt, ["strengths","weaknesses","opportunities","threats","summary"], 400);

    ["S","W","O","T"].forEach((k,i) => {
      const field = ["strengths","weaknesses","opportunities","threats"][i];
      const el    = document.getElementById(`wbSwot${k}`);
      if (el) el.innerHTML = (data[field]||[]).map(item =>
        `<div class="wb3-swot-item">${item}</div>`).join("");
    });

    const summEl = document.getElementById("wbSwotSummary");
    if (summEl && data.summary) {
      const txt = Array.isArray(data.summary) ? data.summary.join(" ") : String(data.summary);
      summEl.innerHTML = txt
        ? `<div class="wb3-action-plan-head">🎯 This week's focus</div><p>${txt}</p>` : "";
    }

    if (intro) intro.style.display = "none";
    if (result) { result.style.display = "block"; }

    // Show regen button
    const regen = document.getElementById("wbSwotRegen");
    if (regen) regen.style.display = "block";

  } catch(e) {
    const desc = document.querySelector(".wb3-analysis-desc");
    if (desc) desc.textContent = "⚠ " + e.message;
  }

  const regenBtn = document.getElementById("wbSwotRegen");
  if (regenBtn) { regenBtn.disabled = false; regenBtn.textContent = "↻ Regenerate analysis"; }
  const genBtn = document.getElementById("wbSwotBtn");
  if (genBtn)  { genBtn.disabled = false;  genBtn.textContent  = "Generate my analysis"; }
}

// ── Export ────────────────────────────────────────────────────
export async function getWellbeingForReport(days = 7) {
  const history = await loadHistory(days).catch(() => []);
  if (!history.length) return null;
  const avg = arr => { const v=arr.filter(Boolean); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null; };
  return {
    avgMood:   avg(history.map(h=>h.mood)),
    avgEnergy: avg(history.map(h=>h.energy)),
    avgStress: avg(history.map(h=>h.stress)),
    avgSleep:  avg(history.map(h=>h.sleep)),
    avgWater:  avg(history.map(h=>h.water)),
    entries:   history.length,
    latest:    history[history.length-1]
  };
}