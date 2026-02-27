import { db, auth } from "../firebase/firebaseConfig.js";
import { askGemini, askGeminiStructured } from "../gemini.js";
import {
  doc, getDoc, setDoc, collection, query,
  orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
async function saveEntry(data) {
  const uid = auth.currentUser?.uid; if (!uid) return;
  await setDoc(doc(db,"wellbeing",uid,"entries",localDateKey()), { ...data, date:localDateKey(), savedAt:serverTimestamp() }, { merge:true });
}
async function loadTodayEntry() {
  const uid = auth.currentUser?.uid; if (!uid) return null;
  const snap = await getDoc(doc(db,"wellbeing",uid,"entries",localDateKey()));
  return snap.exists() ? snap.data() : null;
}
async function loadHistory(n=14) {
  const uid = auth.currentUser?.uid; if (!uid) return [];
  const q = query(collection(db,"wellbeing",uid,"entries"), orderBy("date","desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d=>d.data()).reverse();
}

export function renderWellbeing() {
  return `<div class="wb-page" id="wellbeingPage">

  <div class="wb-header">
    <div>
      <h2 class="wb-title">Wellbeing</h2>
      <div class="wb-subtitle">Mind · Body · Balance — tracked daily</div>
    </div>
    <button class="wb-ai-btn" id="wbAiBtn">✦ AI Check-in</button>
  </div>

  <!-- Tabs -->
  <div class="wb-tabs">
    <button class="wb-tab active" data-tab="checkin">📋 Check-in</button>
    <button class="wb-tab" data-tab="swot">⚡ Wellbeing SWOT</button>
    <button class="wb-tab" data-tab="history">📈 Trends</button>
  </div>

  <!-- CHECK-IN TAB -->
  <div class="wb-tab-panel" id="wbTabCheckin">
    <div class="wb-today-card">
      <div class="wb-card-title">📅 Today — ${new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}</div>

      <div class="wb-section-label">How are you feeling?</div>
      <div class="wb-emoji-row" id="wbMoodRow">
        ${["😞","😔","😐","🙂","😊","😄","🤩"].map((e,i)=>
          `<button class="wb-emoji-btn" data-group="mood" data-val="${i+1}" title="${["Terrible","Bad","Meh","Okay","Good","Great","Amazing"][i]}">
            <span class="wb-emoji-glyph">${e}</span>
            <span class="wb-emoji-label">${["Terrible","Bad","Meh","Okay","Good","Great","Amazing"][i]}</span>
          </button>`).join("")}
      </div>

      <div class="wb-section-label">Energy level</div>
      <div class="wb-emoji-row" id="wbEnergyRow">
        ${["🪫","😴","🐢","⚡","🔋","🚀"].map((e,i)=>
          `<button class="wb-emoji-btn" data-group="energy" data-val="${i+1}" title="${["Drained","Tired","Low","Okay","Good","Energized"][i]}">
            <span class="wb-emoji-glyph">${e}</span>
            <span class="wb-emoji-label">${["Drained","Tired","Low","Okay","Good","Energized"][i]}</span>
          </button>`).join("")}
      </div>

      <div class="wb-section-label">Stress level</div>
      <div class="wb-stress-row">
        ${[{v:1,l:"Calm",c:"#22c55e"},{v:2,l:"Mild",c:"#86efac"},{v:3,l:"Moderate",c:"#f59e0b"},{v:4,l:"High",c:"#f97316"},{v:5,l:"Overwhelmed",c:"#ef4444"}].map(s=>
          `<button class="wb-stress-btn" data-val="${s.v}" style="--stress-color:${s.c}">
            <span class="wb-stress-num">${s.v}</span>
            <span class="wb-stress-lbl">${s.l}</span>
          </button>`).join("")}
      </div>

      <div class="wb-two-col">
        <div class="wb-field">
          <div class="wb-section-label">💤 Sleep</div>
          <div class="wb-slider-wrap">
            <input type="range" class="wb-slider" id="sleepSlider" min="0" max="12" step="0.5" value="7">
            <div class="wb-slider-val"><span id="sleepVal">7</span>h</div>
          </div>
          <div class="wb-slider-hints"><span>0h</span><span>6h</span><span>12h</span></div>
        </div>
        <div class="wb-field">
          <div class="wb-section-label">💧 Water</div>
          <div class="wb-slider-wrap">
            <input type="range" class="wb-slider" id="waterSlider" min="0" max="15" step="1" value="6">
            <div class="wb-slider-val"><span id="waterVal">6</span> glasses</div>
          </div>
          <div class="wb-slider-hints"><span>0</span><span>8</span><span>15</span></div>
        </div>
      </div>

      <div class="wb-section-label">🏃 Exercise</div>
      <div class="wb-toggle-row">
        ${["None","Walk","Workout","Sport","Yoga","Meditation"].map(v=>
          `<button class="wb-toggle-btn" data-group="exercise" data-val="${v}">${v}</button>`).join("")}
      </div>

      <div class="wb-section-label">📝 Note <span style="opacity:0.4;font-size:11px;font-weight:400">(optional)</span></div>
      <textarea class="wb-note-input" id="wbNote" placeholder="How are you really feeling? Anything weighing on your mind..." rows="3"></textarea>

      <button class="wb-save-btn" id="wbSaveBtn">Save Check-in ✓</button>
      <div class="wb-save-msg" id="wbSaveMsg"></div>
    </div>

    <!-- AI insight -->
    <div class="wb-ai-card" id="wbAiCard" style="display:none">
      <div class="wb-card-title">✦ AI Wellbeing Insight</div>
      <div id="wbAiBody" class="wb-ai-body"></div>
    </div>
  </div>

  <!-- SWOT TAB -->
  <div class="wb-tab-panel" id="wbTabSwot" style="display:none">
    <div class="wb-swot-intro">
      <p>Based on your recent wellbeing data, AI generates a personal health & mindset SWOT — what's supporting you, what's draining you, and where to focus.</p>
      <button class="wb-ai-btn" id="wbSwotBtn" style="margin-top:12px">⚡ Generate Wellbeing SWOT</button>
    </div>
    <div id="wbSwotResult" style="display:none">
      <div class="wb-swot-grid">
        <div class="wb-swot-card wb-swot-s"><div class="wb-swot-label">💪 Strengths</div><div class="wb-swot-body" id="wbSwotS"></div></div>
        <div class="wb-swot-card wb-swot-w"><div class="wb-swot-label">⚠ Weaknesses</div><div class="wb-swot-body" id="wbSwotW"></div></div>
        <div class="wb-swot-card wb-swot-o"><div class="wb-swot-label">🌱 Opportunities</div><div class="wb-swot-body" id="wbSwotO"></div></div>
        <div class="wb-swot-card wb-swot-t"><div class="wb-swot-label">🔥 Threats</div><div class="wb-swot-body" id="wbSwotT"></div></div>
      </div>
      <div class="wb-swot-summary" id="wbSwotSummary"></div>
    </div>
  </div>

  <!-- HISTORY TAB -->
  <div class="wb-tab-panel" id="wbTabHistory" style="display:none">

    <!-- Avg summary pills -->
    <div class="wb-trend-summary" id="wbTrendSummary"></div>

    <!-- Individual metric charts -->
    <div class="wb-trend-charts">

      <div class="wb-trend-card">
        <div class="wb-trend-card-header">
          <span class="wb-trend-icon">😊</span>
          <span class="wb-trend-label">Mood</span>
          <span class="wb-trend-avg" id="wbAvgMood">—</span>
        </div>
        <div class="wb-trend-chart-wrap">
          <canvas id="wbChartMood"></canvas>
        </div>
        <div class="wb-trend-scale">1 Terrible → 7 Amazing</div>
      </div>

      <div class="wb-trend-card">
        <div class="wb-trend-card-header">
          <span class="wb-trend-icon">⚡</span>
          <span class="wb-trend-label">Energy</span>
          <span class="wb-trend-avg" id="wbAvgEnergy">—</span>
        </div>
        <div class="wb-trend-chart-wrap">
          <canvas id="wbChartEnergy"></canvas>
        </div>
        <div class="wb-trend-scale">1 Drained → 6 Energized</div>
      </div>

      <div class="wb-trend-card">
        <div class="wb-trend-card-header">
          <span class="wb-trend-icon">😰</span>
          <span class="wb-trend-label">Stress</span>
          <span class="wb-trend-avg" id="wbAvgStress">—</span>
        </div>
        <div class="wb-trend-chart-wrap">
          <canvas id="wbChartStress"></canvas>
        </div>
        <div class="wb-trend-scale">1 Calm → 5 Overwhelmed</div>
      </div>

      <div class="wb-trend-card">
        <div class="wb-trend-card-header">
          <span class="wb-trend-icon">💤</span>
          <span class="wb-trend-label">Sleep (hours)</span>
          <span class="wb-trend-avg" id="wbAvgSleep">—</span>
        </div>
        <div class="wb-trend-chart-wrap">
          <canvas id="wbChartSleep"></canvas>
        </div>
        <div class="wb-trend-scale">Recommended: 7–9h</div>
      </div>

    </div>

    <!-- Day-by-day log -->
    <div class="wb-history-card" style="margin-top:16px">
      <div class="wb-card-title">📋 Daily Log</div>
      <div id="wbHistoryList" class="wb-history-list"></div>
    </div>

  </div>

</div>`;
}

let wbState = { mood:null, energy:null, stress:null, sleep:7, water:6, exercise:"None" };

export async function initWellbeing() {
  const today = await loadTodayEntry().catch(()=>null);
  if (today) applyState(today);

  // Tab switching
  document.querySelectorAll(".wb-tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".wb-tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".wb-tab-panel").forEach(p=>p.style.display="none");
      const panel = document.getElementById("wbTab" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
      if (panel) { panel.style.display="block"; }
      if (tab.dataset.tab === "history") loadAndRenderHistory();
    };
  });

  // Emoji pickers
  document.querySelectorAll(".wb-emoji-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(`.wb-emoji-btn[data-group="${btn.dataset.group}"]`).forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      wbState[btn.dataset.group] = parseInt(btn.dataset.val);
    };
  });

  // Stress
  document.querySelectorAll(".wb-stress-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".wb-stress-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      wbState.stress = parseInt(btn.dataset.val);
    };
  });

  // Exercise
  document.querySelectorAll(".wb-toggle-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(`.wb-toggle-btn[data-group="${btn.dataset.group}"]`).forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      wbState[btn.dataset.group] = btn.dataset.val;
    };
  });

  // Sliders
  const sleepSlider = document.getElementById("sleepSlider");
  const waterSlider = document.getElementById("waterSlider");
  if (sleepSlider) {
    sleepSlider.value = wbState.sleep ?? 7;
    sleepSlider.oninput = () => { wbState.sleep = parseFloat(sleepSlider.value); document.getElementById("sleepVal").textContent = wbState.sleep; };
  }
  if (waterSlider) {
    waterSlider.value = wbState.water ?? 6;
    waterSlider.oninput = () => { wbState.water = parseInt(waterSlider.value); document.getElementById("waterVal").textContent = wbState.water; };
  }

  // Save
  document.getElementById("wbSaveBtn").onclick = async () => {
    const btn = document.getElementById("wbSaveBtn");
    const msg = document.getElementById("wbSaveMsg");
    wbState.note = document.getElementById("wbNote")?.value || "";
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await saveEntry(wbState);
      msg.textContent = "✓ Saved!"; msg.style.color = "var(--accent)";
      setTimeout(()=>{ msg.textContent = ""; }, 3000);
    } catch(e) {
      msg.textContent = "Failed: " + e.message; msg.style.color = "#ef4444";
    }
    btn.disabled = false; btn.textContent = "Save Check-in ✓";
  };

  // AI check-in
  document.getElementById("wbAiBtn").onclick = generateAiInsight;

  // Wellbeing SWOT
  document.getElementById("wbSwotBtn")?.addEventListener("click", generateWellbeingSwot);
}

function applyState(entry) {
  wbState = { ...wbState, ...entry };
  ["mood","energy"].forEach(group => {
    if (entry[group]) {
      const btn = document.querySelector(`.wb-emoji-btn[data-group="${group}"][data-val="${entry[group]}"]`);
      if (btn) btn.classList.add("active");
    }
  });
  if (entry.stress) {
    const btn = document.querySelector(`.wb-stress-btn[data-val="${entry.stress}"]`);
    if (btn) btn.classList.add("active");
  }
  const sleepSl = document.getElementById("sleepSlider");
  const waterSl = document.getElementById("waterSlider");
  if (entry.sleep != null) { wbState.sleep = entry.sleep; if (sleepSl) sleepSl.value = entry.sleep; document.getElementById("sleepVal").textContent = entry.sleep; }
  if (entry.water != null) { wbState.water = entry.water; if (waterSl) waterSl.value = entry.water; document.getElementById("waterVal").textContent = entry.water; }
  if (entry.exercise) { const btn = document.querySelector(`.wb-toggle-btn[data-val="${entry.exercise}"]`); if (btn) btn.classList.add("active"); }
  const noteEl = document.getElementById("wbNote"); if (noteEl && entry.note) noteEl.value = entry.note;
}

async function loadAndRenderHistory() {
  const history = await loadHistory(14).catch(()=>[]);
  if (!history.length) { document.getElementById("wbHistoryList").innerHTML = "<p style='color:var(--muted);font-size:13px;text-align:center;padding:20px'>No history yet — save your first check-in above.</p>"; return; }
  renderMoodChart(history);
  renderHistoryList(history);
}

function renderMoodChart(history) {
  // Uses Chart.js for proper rendering — renders 4 individual metric charts
  if (typeof Chart === "undefined") return;

  const isDark   = document.body.classList.contains("dark");
  const textCol  = isDark ? "rgba(203,213,225,0.75)" : "rgba(30,41,59,0.7)";
  const gridCol  = isDark ? "rgba(255,255,255,0.05)"  : "rgba(0,0,0,0.05)";

  const labels   = history.map(h => {
    const d = new Date(h.date);
    return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  });

  const avg = arr => {
    const v = arr.filter(x => x != null && x > 0);
    return v.length ? (v.reduce((a,b)=>a+b,0)/v.length) : null;
  };

  const makeWbChart = (id, data, color, min, max, avgId, avgSuffix="") => {
    const el = document.getElementById(id);
    if (!el) return;
    if (Chart.getChart(el)) Chart.getChart(el).destroy();

    const avgVal = avg(data);
    const avgEl  = document.getElementById(avgId);
    if (avgEl) avgEl.textContent = avgVal ? avgVal.toFixed(1) + avgSuffix : "—";

    // Color-code individual points
    const pointColors = data.map(v => {
      if (v == null) return "transparent";
      const pct = (v - min) / (max - min);
      if (id === "wbChartStress") {
        // Higher stress = worse (red)
        if (pct > 0.7) return "#ef4444";
        if (pct > 0.4) return "#f97316";
        return "#22c55e";
      } else {
        // Higher mood/energy/sleep = better (green)
        if (pct > 0.65) return "#00c87a";
        if (pct > 0.35) return "#f59e0b";
        return "#ef4444";
      }
    });

    new Chart(el, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data,
          borderColor: color,
          backgroundColor: color + "18",
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: pointColors,
          pointBorderColor: "transparent",
          pointRadius: 5,
          pointHoverRadius: 7,
          spanGaps: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.y ?? "—"}${avgSuffix}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridCol },
            ticks: { color: textCol, font: { size: 10 }, maxTicksLimit: 7 }
          },
          y: {
            grid: { color: gridCol },
            ticks: { color: textCol, font: { size: 10 } },
            min, max,
            beginAtZero: false,
          }
        },
        animation: { duration: 600 }
      }
    });
  };

  makeWbChart("wbChartMood",   history.map(h=>h.mood  ||null), "#00c87a", 1, 7, "wbAvgMood");
  makeWbChart("wbChartEnergy", history.map(h=>h.energy||null), "#f97316", 1, 6, "wbAvgEnergy");
  makeWbChart("wbChartStress", history.map(h=>h.stress||null), "#ef4444", 1, 5, "wbAvgStress");
  makeWbChart("wbChartSleep",  history.map(h=>h.sleep ||null), "#00d9f5", 0, 12,"wbAvgSleep", "h");

  // Summary pills
  const summaryEl = document.getElementById("wbTrendSummary");
  if (summaryEl) {
    const moodAvg   = avg(history.map(h=>h.mood));
    const energyAvg = avg(history.map(h=>h.energy));
    const stressAvg = avg(history.map(h=>h.stress));
    const sleepAvg  = avg(history.map(h=>h.sleep));

    const pill = (icon, label, val, good) => {
      const color = val == null ? "#94a3b8"
        : good ? "#00c87a" : "#ef4444";
      return `<div class="wb-summary-pill" style="border-color:${color}20;background:${color}12">
        <span>${icon}</span>
        <span style="color:${color};font-weight:700">${val != null ? val.toFixed(1) : "—"}</span>
        <span style="opacity:0.6">${label}</span>
      </div>`;
    };

    summaryEl.innerHTML =
      pill("😊", "avg mood",   moodAvg,   moodAvg   != null && moodAvg   >= 4) +
      pill("⚡", "avg energy", energyAvg, energyAvg != null && energyAvg >= 3.5) +
      pill("😰", "avg stress", stressAvg, stressAvg != null && stressAvg <= 2.5) +
      pill("💤", "avg sleep",  sleepAvg,  sleepAvg  != null && sleepAvg  >= 7);
  }
}

function renderHistoryList(history) {
  const list = document.getElementById("wbHistoryList"); if (!list) return;
  const moodEmojis   = ["","😞","😔","😐","🙂","😊","😄","🤩"];
  const energyEmojis = ["","🪫","😴","🐢","⚡","🔋","🚀"];
  const stressColors = ["","#22c55e","#86efac","#f59e0b","#f97316","#ef4444"];
  list.innerHTML = [...history].reverse().slice(0,7).map(h=>`
    <div class="wb-hist-row">
      <div class="wb-hist-date">${new Date(h.date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
      <div class="wb-hist-icons">
        ${h.mood?`<span title="Mood">${moodEmojis[h.mood]}</span>`:""}
        ${h.energy?`<span title="Energy">${energyEmojis[h.energy]}</span>`:""}
        ${h.stress?`<span class="wb-hist-stress" style="background:${stressColors[h.stress]}" title="Stress ${h.stress}/5">${h.stress}</span>`:""}
        ${h.sleep!=null?`<span class="wb-hist-pill">💤 ${h.sleep}h</span>`:""}
        ${h.water!=null?`<span class="wb-hist-pill">💧 ${h.water}</span>`:""}
        ${h.exercise&&h.exercise!=="None"?`<span class="wb-hist-pill">🏃 ${h.exercise}</span>`:""}
      </div>
      ${h.note?`<div class="wb-hist-note">${h.note}</div>`:""}
    </div>`).join("");
}

async function generateAiInsight() {
  const btn  = document.getElementById("wbAiBtn");
  const card = document.getElementById("wbAiCard");
  const body = document.getElementById("wbAiBody");
  if (!card||!body) return;
  btn.disabled=true; btn.textContent="✦ Thinking…";
  card.style.display="block";
  body.innerHTML=`<div style="opacity:0.5;font-style:italic">Analyzing your wellbeing…</div>`;
  const history = await loadHistory(7).catch(()=>[]);
  const moodLabels   = ["","Terrible","Bad","Meh","Okay","Good","Great","Amazing"];
  const energyLabels = ["","Drained","Tired","Low","Okay","Good","Energized"];
  const stressLabels = ["","Calm","Mild","Moderate","High","Overwhelmed"];
  const recentTrend  = history.slice(-5).map(h =>
    `${h.date.slice(5)}: mood ${h.mood||"?"}/7 energy ${h.energy||"?"}/6 stress ${h.stress||"?"}/5 sleep ${h.sleep||"?"}h`
  ).join("; ") || "no history";

  // Build a rich trend summary
  const trends = history.slice(-7);
  const avgMood7   = trends.length ? (trends.reduce((a,h)=>a+(h.mood||0),0)/trends.length).toFixed(1) : null;
  const avgSleep7  = trends.length ? (trends.reduce((a,h)=>a+(h.sleep||0),0)/trends.length).toFixed(1) : null;
  const avgStress7 = trends.length ? (trends.reduce((a,h)=>a+(h.stress||0),0)/trends.length).toFixed(1) : null;
  const trendSummary = avgMood7
    ? `7-day averages: mood ${avgMood7}/7, stress ${avgStress7}/5, sleep ${avgSleep7}h.`
    : "No trend history yet.";

  const todayStr = [
    "Mood: " + (moodLabels[wbState.mood]  || "not set"),
    "Energy: " + (energyLabels[wbState.energy] || "not set"),
    "Stress: " + (stressLabels[wbState.stress] || "not set"),
    "Sleep: " + wbState.sleep + "h",
    "Water: " + wbState.water + " glasses",
    "Exercise: " + (wbState.exercise || "None"),
    wbState.note ? "Note: \"" + wbState.note + "\"" : null
  ].filter(Boolean).join(", ");

  const prompt = "You are a warm, perceptive wellbeing coach. Write a genuinely personalised check-in — not generic.\n\n"
    + "TODAY: " + todayStr + "\n"
    + "RECENT TREND: " + recentTrend + "\n"
    + trendSummary + "\n\n"
    + "Write exactly 4 short paragraphs (no headers, no bullet points, ~150 words total):\n"
    + "1. Acknowledge today's emotional state with real empathy — name how they actually feel\n"
    + "2. Point out one specific pattern in their recent data (mention actual numbers if meaningful)\n"
    + "3. One honest insight — something they might not have noticed themselves\n"
    + "4. One concrete, specific action for tomorrow (not generic — tie it to their actual data)";

  try {
    const text = await askGemini(prompt, 400);
    body.innerHTML = text.split("\n\n").filter(Boolean).map(p=>`<p style="margin:0 0 12px">${p.trim()}</p>`).join("");
  } catch(e) {
    body.innerHTML = `<div style="color:#ef4444">⚠ ${e.message}</div>`;
  }
  btn.disabled=false; btn.textContent="✦ AI Check-in";
}

async function generateWellbeingSwot() {
  const btn = document.getElementById("wbSwotBtn");
  const result = document.getElementById("wbSwotResult");
  btn.disabled=true; btn.textContent="⚡ Analyzing…";
  result.style.display="none";
  const history = await loadHistory(14).catch(()=>[]);
  if (!history.length && !wbState.mood) {
    btn.disabled=false; btn.textContent="⚡ Generate Wellbeing SWOT";
    document.querySelector(".wb-swot-intro p").textContent = "⚠ Fill in today's check-in first so the AI has data to analyze.";
    return;
  }
  const avg = (arr) => { const v=arr.filter(Boolean); return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null; };
  const avgMood   = avg(history.map(h=>h.mood));
  const avgEnergy = avg(history.map(h=>h.energy));
  const avgStress = avg(history.map(h=>h.stress));
  const avgSleep  = avg(history.map(h=>h.sleep));
  const prompt = `Analyze this person's 14-day wellbeing for a personal health SWOT.
Avg mood: ${avgMood||wbState.mood||"?"}/7, energy: ${avgEnergy||wbState.energy||"?"}/6, stress: ${avgStress||wbState.stress||"?"}/5, sleep: ${avgSleep||wbState.sleep||"?"}h.
Today: mood=${wbState.mood||"?"}, energy=${wbState.energy||"?"}, stress=${wbState.stress||"?"}, exercise=${wbState.exercise||"None"}.
Notes: ${history.filter(h=>h.note).slice(-3).map(h=>h.note).join("; ")||"none"}.
Give 2-3 real, personalized items per section based on the actual numbers.`;
  try {
    const data = await askGeminiStructured(prompt,
      ["strengths", "weaknesses", "opportunities", "threats", "summary"], 350);
    const renderItems = (arr) => (arr||[]).map(i=>`<div class="wb-swot-item">${i}</div>`).join("");
    document.getElementById("wbSwotS").innerHTML = renderItems(data.strengths);
    document.getElementById("wbSwotW").innerHTML = renderItems(data.weaknesses);
    document.getElementById("wbSwotO").innerHTML = renderItems(data.opportunities);
    document.getElementById("wbSwotT").innerHTML = renderItems(data.threats);
    const summaryArr = data.summary || [];
    const summaryText = Array.isArray(summaryArr) ? summaryArr.join(" ") : String(summaryArr || "");
    document.getElementById("wbSwotSummary").innerHTML = summaryText
      ? `<p style="font-size:13px;color:var(--muted);margin-top:12px;line-height:1.6">${summaryText}</p>` : "";
    result.style.display = "block";
  } catch(e) {
    document.querySelector(".wb-swot-intro p").textContent = `⚠ ${e.message}`;
  }
  btn.disabled=false; btn.textContent="⚡ Regenerate SWOT";
}

// ── Export for report integration ────────────────────────────
export async function getWellbeingForReport(days=7) {
  const history = await loadHistory(days).catch(()=>[]);
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