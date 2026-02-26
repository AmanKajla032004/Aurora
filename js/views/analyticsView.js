import { getTasksFromCloud } from "../firebase/firestoreService.js";
import { askGemini } from "../gemini.js";
import { getWellbeingForReport } from "./wellbeingView.js";

export function renderAnalytics() {
  return `
<div class="analytics-container">

  <!-- 1. KEY STATS — first thing user wants to see -->
  <div class="analytics-top stat-card">
    <div class="analytics-score-card">
      <div class="score-ring-wrap">
        <svg class="score-ring-svg" viewBox="0 0 120 120">
          <circle class="score-ring-bg"   cx="60" cy="60" r="50"/>
          <circle class="score-ring-fill" id="scoreRingFill" cx="60" cy="60" r="50"
            stroke-dasharray="314.16" stroke-dashoffset="314.16"/>
        </svg>
        <div class="score-ring-label">
          <span class="score-num" id="scoreNum">—</span>
          <span class="score-sub">SCORE</span>
        </div>
      </div>
      <div class="score-info">
        <h3 id="scoreLabel">Loading…</h3>
        <p id="scoreMsg" style="color:var(--muted);font-size:13px"></p>
      </div>
    </div>
    <div class="analytics-mini-stats" id="miniStats">
      <div style="color:var(--muted);font-size:13px;padding:12px">Loading stats…</div>
    </div>
  </div>

  <!-- 2. PERSONAL INSIGHTS — actionable, shown prominently -->
  <div class="analytics-insights-grid" id="analyticsInsights"></div>

  <!-- 3. GOAL PROGRESS — what matters most -->
  <div class="chart-card">
    <h3>Goal Progress</h3>
    <div class="goal-progress-wrap" id="goalProgressWrap">
      <div style="color:var(--muted);font-size:13px">Loading…</div>
    </div>
  </div>

  <!-- 4. ACTIVITY HEATMAP — streak at a glance -->
  <div class="chart-card">
    <h3>Activity — Last 12 Weeks</h3>
    <div class="heatmap-grid" id="heatmapGrid" style="margin:12px 0"></div>
    <div class="heatmap-legend">
      <span style="font-size:10px;color:var(--muted)">Less</span>
      ${[0.12,0.3,0.55,0.8,1].map(o => `<span class="heat-cell" style="background:rgba(0,200,122,${o});width:12px;height:12px;flex-shrink:0"></span>`).join("")}
      <span style="font-size:10px;color:var(--muted)">More</span>
    </div>
  </div>

  <!-- 5. COMPLETION TREND — recent momentum -->
  <div class="charts-section">
    <div class="chart-card" style="position:relative;min-height:240px">
      <h3>Completions — Last 30 Days</h3>
      <canvas id="trendChart"></canvas>
    </div>
    <div class="chart-card" style="position:relative;min-height:240px">
      <h3>Weekly Velocity</h3>
      <canvas id="velocityChart"></canvas>
    </div>
  </div>

  <!-- 6. BEHAVIOUR PATTERNS -->
  <div class="charts-section">
    <div class="chart-card" style="position:relative;min-height:240px">
      <h3>Best Day of Week</h3>
      <canvas id="dowChart"></canvas>
    </div>
    <div class="chart-card" style="position:relative;min-height:240px">
      <h3>Peak Hours</h3>
      <canvas id="hourChart"></canvas>
    </div>
  </div>

  <!-- 7. TASK BREAKDOWN -->
  <div class="charts-section">
    <div class="chart-card" style="position:relative;min-height:240px">
      <h3>Priority Breakdown</h3>
      <canvas id="priorityChart"></canvas>
    </div>
    <div class="chart-card" style="position:relative;min-height:240px">
      <h3>On-Time vs Late</h3>
      <canvas id="overdueChart"></canvas>
    </div>
  </div>

  <!-- 8. TASK TYPE MIX -->
  <div class="chart-card" style="position:relative;min-height:240px">
    <h3>Task Type Distribution</h3>
    <canvas id="typeChart"></canvas>
  </div>

  <!-- 9. AI ANALYSIS — wellbeing-aware -->
  <div class="chart-card analytics-ai-card" id="analyticsAiCard">
    <div class="analytics-ai-header">
      <div>
        <h3 style="margin:0 0 4px">✦ AI Analysis</h3>
        <p style="margin:0;font-size:12px;color:var(--muted)">Combines your tasks + wellbeing for a full picture</p>
      </div>
      <button class="analytics-ai-btn" id="analyticsAiBtn">Generate Analysis</button>
    </div>
    <div id="analyticsAiNudge" class="analytics-ai-nudge" style="display:none">
      💙 <strong>Tip:</strong> Fill in today's <a href="#" id="analyticsGoWellbeing" style="color:var(--accent)">Wellbeing check-in</a> for a richer, more personalized analysis.
      <button id="analyticsSkipWb" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;text-decoration:underline;padding:0 0 0 8px">Skip</button>
    </div>
    <div id="analyticsAiBody" class="analytics-ai-body" style="display:none"></div>
  </div>

</div>`;
}

export async function initAnalytics() {
  // ---- isDark MUST be first — used everywhere below ----
  const isDark    = document.body.classList.contains("dark");
  const textCol   = isDark ? "rgba(203,213,225,0.85)" : "rgba(30,41,59,0.80)";
  const gridCol   = isDark ? "rgba(255,255,255,0.05)"  : "rgba(0,0,0,0.05)";
  const borderCol = isDark ? "rgba(255,255,255,0.07)"  : "rgba(0,0,0,0.07)";
  const root      = document.documentElement;
  const acc       = root.style.getPropertyValue("--accent").trim()  || "#00c87a";
  const acc2      = root.style.getPropertyValue("--accent2").trim() || "#00d9f5";
  const acc3      = "#7800ff", acc4 = "#f97316";

  // ---- Chart.js guard ----
  if (typeof Chart === "undefined") {
    console.error("Chart.js not loaded");
    return;
  }

  // ---- Shared chart factory ----
  function makeChart(id, type, data, options = {}) {
    const el = document.getElementById(id);
    if (!el) { console.warn("Canvas not found:", id); return; }
    if (Chart.getChart(el)) Chart.getChart(el).destroy();
    el.style.width  = "100%";
    el.style.height = "200px";
    return new Chart(el, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: options.legend ?? false,
            labels: { color: textCol, boxWidth: 11, font: { size: 11 }, padding: 10 }
          }
        },
        scales: type !== "doughnut" && type !== "pie" ? {
          x: { grid: { color: gridCol }, ticks: { color: textCol, font: { size: 11 }, maxTicksLimit: 12 }, border: { color: borderCol } },
          y: { grid: { color: gridCol }, ticks: { color: textCol, font: { size: 11 } }, beginAtZero: true, border: { color: borderCol } }
        } : {},
        animation: { duration: 800, easing: "easeInOutQuart" },
        ...options
      }
    });
  }

  const tasks = await getTasksFromCloud();
  const now   = new Date();

  if (tasks.length === 0) {
    const container = document.querySelector(".analytics-container");
    if (container) {
      container.innerHTML = `
        <div class="analytics-top stat-card" style="text-align:center;padding:48px 20px">
          <div style="font-size:52px;margin-bottom:16px">📊</div>
          <h3 style="color:var(--text);font-size:20px;margin:0 0 10px">No tasks yet</h3>
          <p style="color:var(--muted);font-size:14px;margin:0;line-height:1.6">Add tasks and start completing them — analytics appear automatically.</p>
        </div>`;
    }
    return;
  }

  // ---- PRODUCTIVITY SCORE ----
  const streak   = calcStreak(tasks);
  const rate     = tasks.length ? (tasks.filter(t => t.completed).length / tasks.length) * 100 : 0;
  const totalDone = tasks.filter(t => t.completed).length;
  const maxStreak = calcMaxStreak(tasks);
  const score     = Math.min(100, Math.round((streak / 30) * 30 + (rate / 100) * 40 + Math.min(totalDone, 50) / 50 * 20 + (maxStreak / 30) * 10));
  const labels    = [[80,"Outstanding 🚀","You're at the top of your game."],[60,"Good Work 👍","Keep building on this momentum."],[40,"Keep Going 💪","Every session matters. Don't stop."],[0,"Just Starting 🌱","Every great journey starts with day one."]];
  const [, lbl, msg] = labels.find(([min]) => score >= min);
  animateNum(document.getElementById("scoreNum"), score, 1200);
  document.getElementById("scoreLabel").textContent = lbl;
  document.getElementById("scoreMsg").textContent   = msg;
  const fill  = document.getElementById("scoreRingFill");
  const circ  = 2 * Math.PI * 50;
  if (fill) setTimeout(() => { fill.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)"; fill.style.strokeDashoffset = circ * (1 - score / 100); }, 100);

  // ---- MINI STATS ----
  const bestDay  = getBestDay(tasks);
  const avgDaily = getAvgDailyTasks(tasks, 30);
  document.getElementById("miniStats").innerHTML = [
    ["🔥", "Current Streak",   `${streak} day${streak!==1?"s":""}`],
    ["🏆", "Longest Streak",   `${maxStreak} days`],
    ["✓",  "Completion Rate",  `${Math.round(rate)}%`],
    ["📅", "Best Day",         bestDay],
    ["⚡", "Total Done",       totalDone],
    ["📊", "Avg / Day (30d)",  avgDaily.toFixed(1)],
  ].map(([icon, label, val]) => `
    <div class="analytics-mini">
      <div class="am-label"><span class="am-icon">${icon}</span> ${label}</div>
      <div class="am-val">${val}</div>
    </div>`).join("");

    // ---- HEATMAP ----
  const heatmap = document.getElementById("heatmapGrid");
  if (heatmap) {
    const completionMap = {};
    tasks.filter(t => t.completed && t.completedAt).forEach(t => {
      const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
      completionMap[localDate(d)] = (completionMap[localDate(d)] || 0) + 1;
    });
    const maxCount = Math.max(1, ...Object.values(completionMap));

    // Build 12 weeks (84 days) of cells, 7 rows (days) × 12 cols (weeks)
    // Grid auto-flows column, so push day0..day6 for each week
    const cells = [];
    // Day-of-week labels (Sun=0..Sat=6)
    const dayAbbr = ["S","M","T","W","T","F","S"];

    for (let w = 11; w >= 0; w--) {
      for (let day = 0; day < 7; day++) {
        const d = new Date(now);
        d.setDate(now.getDate() - w*7 - (now.getDay() - day));
        const key = localDate(d);
        const cnt = completionMap[key] || 0;
        const intensity = cnt / maxCount;
        const emptyBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
        const bg = cnt === 0 ? emptyBg : `rgba(0,200,122,${(0.2 + intensity * 0.8).toFixed(2)})`;
        const isToday = key === localDate(now);
        cells.push(`<div class="heat-cell${isToday?" heat-today":""}" style="background:${bg}" title="${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}: ${cnt} task${cnt!==1?"s":""} completed"></div>`);
      }
    }
    heatmap.innerHTML = cells.join("");
    // CSS in analytics-fix.css handles grid-template-rows:7 + grid-auto-flow:column
  }

  // ---- 30-day trend ----
  const days30 = Array.from({length:30},(_,i)=>{ const d=new Date(now); d.setDate(now.getDate()-29+i); return d; });
  const doneByDay = days30.map(d => tasks.filter(t => t.completed && t.completedAt && localDate(new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt)) === localDate(d)).length);
  const createdByDay = days30.map(d => tasks.filter(t => t.createdAt && localDate(new Date(t.createdAt.seconds ? t.createdAt.seconds*1000 : t.createdAt)) === localDate(d)).length);
  const dayLabels = days30.map(d => { const diff = Math.round((now - d) / 86400000); return diff === 0 ? "Today" : diff === 1 ? "Yest" : d.getDate().toString(); });
  makeChart("trendChart","bar",{ labels: dayLabels, datasets:[
    { label:"Completed", data:doneByDay, backgroundColor: days30.map((_,i) => i === 29 ? acc : acc+"55"), borderRadius:4 },
    { label:"Created",   data:createdByDay, backgroundColor: acc2+"44", borderRadius:4 }
  ]}, { legend: true });

  // ---- Day of week ----
  const dows = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dowCounts = Array(7).fill(0);
  tasks.filter(t => t.completed && t.completedAt).forEach(t => {
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    dowCounts[d.getDay()]++;
  });
  const maxDow = Math.max(...dowCounts);
  makeChart("dowChart","bar",{ labels: dows, datasets:[{ data: dowCounts, backgroundColor: dowCounts.map(c => c === maxDow ? acc : acc+"55"), borderRadius:6 }]});

  // ---- Priority breakdown ----
  const pLabels = ["Low","Medium","High","Very High","Critical"];
  const pColors = ["#6b7280","#f59e0b","#f97316","#ef4444","#dc2626"];
  const pDone    = [1,2,3,4,5].map(p => tasks.filter(t=>t.priority===p&&t.completed).length);
  const pPending = [1,2,3,4,5].map(p => tasks.filter(t=>t.priority===p&&!t.completed).length);
  makeChart("priorityChart","bar",{ labels:pLabels, datasets:[
    { label:"Done",    data:pDone,    backgroundColor:pColors.map(c=>c+"aa"), borderRadius:4 },
    { label:"Pending", data:pPending, backgroundColor:pColors.map(c=>c+"44"), borderRadius:4 }
  ]}, { legend:true });

  // ---- Task types ----
  const types = ["daily","weekly","monthly","yearly","custom"];
  const typeCounts = types.map(t => tasks.filter(tk => tk.type === t).length);
  makeChart("typeChart","bar",{
    labels: ["Daily","Weekly","Monthly","Yearly","Custom"],
    datasets:[{ data:typeCounts, backgroundColor:[acc+"cc",acc2+"cc",acc3+"cc",acc4+"cc","#ec4899cc"], borderRadius:6 }]
  });

  // ---- NEW: Completion by hour ----
  const hourCounts = Array(24).fill(0);
  tasks.filter(t => t.completed && t.completedAt).forEach(t => {
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    hourCounts[d.getHours()]++;
  });
  const hourLabels = Array.from({length:24},(_,i) => i === 0?"12a" : i < 12 ? `${i}a` : i === 12 ? "12p" : `${i-12}p`);
  makeChart("hourChart","bar",{
    labels: hourLabels,
    datasets:[{ data:hourCounts, backgroundColor: hourCounts.map(c => c >= Math.max(...hourCounts)*0.8 ? acc : acc+"55"), borderRadius:4 }]
  });

  // ---- NEW: Overdue vs On-time ----
  const completed = tasks.filter(t => t.completed);
  const onTime  = completed.filter(t => !t.dueDate || !t.completedAt || (new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt) <= new Date(t.dueDate + "T23:59:59"))).length;
  const late    = completed.length - onTime;
  const noDue   = tasks.filter(t => t.completed && !t.dueDate).length;
  makeChart("overdueChart","doughnut",{
    labels: ["On Time","Late","No Deadline"],
    datasets:[{ data:[onTime, late, noDue], backgroundColor:[acc+"cc", "#ef4444cc", "#94a3b8cc"], borderWidth:0 }]
  }, { legend:true });

  // ---- NEW: Weekly velocity (8 weeks) ----
  const weeks8 = Array.from({length:8},(_,i) => {
    const start = new Date(now); start.setDate(now.getDate() - (7-i)*7);
    const end   = new Date(start); end.setDate(start.getDate() + 7);
    return { start, end, label: `W${8-i}` };
  });
  const velocity = weeks8.map(w => tasks.filter(t => {
    if (!t.completed || !t.completedAt) return false;
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    return d >= w.start && d < w.end;
  }).length);
  makeChart("velocityChart","line",{
    labels: weeks8.map(w => w.label),
    datasets:[{
      label:"Tasks completed", data:velocity,
      borderColor: acc, backgroundColor: acc+"22",
      fill:true, tension:0.4, pointBackgroundColor:acc, pointRadius:5
    }]
  }, { legend:false });

  // ---- NEW: Goal progress ----
  const goalWrap = document.getElementById("goalProgressWrap");
  if (goalWrap) {
    const goalTypes = [
      { key:"monthly", label:"Monthly Goals", icon:"📅" },
      { key:"yearly",  label:"Yearly Goals",  icon:"🎯" },
    ];
    goalWrap.innerHTML = goalTypes.map(gt => {
      const total = tasks.filter(t => t.type === gt.key).length;
      const done  = tasks.filter(t => t.type === gt.key && t.completed).length;
      const pct   = total ? Math.round((done/total)*100) : 0;
      return `
      <div class="goal-progress-row">
        <div class="goal-progress-label">
          <span>${gt.icon} ${gt.label}</span>
          <span class="goal-progress-pct">${done}/${total} · ${pct}%</span>
        </div>
        <div class="goal-progress-track">
          <div class="goal-progress-fill" style="width:${pct}%;background:${pct>=80?acc:pct>=50?"#f59e0b":"#ef4444"}"></div>
        </div>
      </div>`;
    }).join("");
  }

  // ---- INSIGHT CARDS ----
  const insights = generateInsights(tasks, streak, rate, bestDay, maxStreak);
  const insightGrid = document.getElementById("analyticsInsights");
  if (insightGrid) {
    insightGrid.innerHTML = insights.map(ins => `
      <div class="insight-card">
        <div class="insight-icon">${ins.icon}</div>
        <div class="insight-content">
          <div class="insight-title">${ins.title}</div>
          <div class="insight-body">${ins.body}</div>
        </div>
      </div>`).join("");
  }

  // ---- AI ANALYSIS BUTTON ----
  const aiBtn  = document.getElementById("analyticsAiBtn");
  const aiBod  = document.getElementById("analyticsAiBody");
  const aiNudge = document.getElementById("analyticsAiNudge");

  // Navigation links inside nudge
  document.getElementById("analyticsGoWellbeing")?.addEventListener("click", e => {
    e.preventDefault();
    import("../router.js").then(({ navigate }) => navigate("wellbeing"));
  });
  document.getElementById("analyticsSkipWb")?.addEventListener("click", () => {
    if (aiNudge) aiNudge.style.display = "none";
    runAnalyticsAI(tasks, streak, rate, maxStreak, totalDone, bestDay, null);
  });

  if (aiBtn) {
    aiBtn.onclick = async () => {
      aiBtn.disabled = true;
      aiBtn.textContent = "Analyzing…";
      if (aiBod) { aiBod.style.display = "block"; aiBod.innerHTML = `<div style="opacity:0.5;font-style:italic">Fetching data…</div>`; }

      // Check wellbeing
      let wellbeing = null;
      try { wellbeing = await getWellbeingForReport(7); } catch(e) {}

      if (!wellbeing) {
        // Show nudge but still allow proceeding
        if (aiNudge) aiNudge.style.display = "flex";
        if (aiBod) aiBod.style.display = "none";
        aiBtn.disabled = false;
        aiBtn.textContent = "Generate Analysis";
        return;
      }

      if (aiNudge) aiNudge.style.display = "none";
      await runAnalyticsAI(tasks, streak, rate, maxStreak, totalDone, bestDay, wellbeing);
      aiBtn.disabled = false;
      aiBtn.textContent = "Regenerate";
    };
  }
}

async function runAnalyticsAI(tasks, streak, rate, maxStreak, totalDone, bestDay, wellbeing) {
  const aiBod = document.getElementById("analyticsAiBody");
  if (!aiBod) return;
  aiBod.style.display = "block";
  aiBod.innerHTML = `<div style="opacity:0.5;font-style:italic">✦ Analyzing your productivity…</div>`;

  const overdue  = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const pending  = tasks.filter(t => !t.completed).length;
  const topTasks = tasks.filter(t => !t.completed).sort((a,b) => (b.priority||0)-(a.priority||0)).slice(0,3).map(t=>t.title).join(", ");

  const wbSection = wellbeing ? `
Wellbeing (last 7 days):
- Avg mood: ${wellbeing.avgMood}/7, avg energy: ${wellbeing.avgEnergy}/6, avg stress: ${wellbeing.avgStress}/5
- Avg sleep: ${wellbeing.avgSleep}h/night, avg water: ${wellbeing.avgWater} glasses/day
- Days tracked: ${wellbeing.entries}` : "Wellbeing: not tracked this week";

  const prompt = `You are a sharp, honest productivity coach. Analyze this person's week and give a personalized assessment.

TASK DATA:
- Current streak: ${streak} days, longest ever: ${maxStreak} days
- Completion rate: ${Math.round(rate)}%, total done: ${totalDone}
- Pending: ${pending}, overdue: ${overdue}
- Top priorities pending: ${topTasks || "none"}
- Best day: ${bestDay}
${wbSection}

Write 4 short paragraphs (no headers, plain text):
1. Overall assessment — be direct and honest (2-3 sentences)
2. What the data says about their energy/stress vs productivity pattern
3. Their biggest opportunity right now (specific, actionable)
4. One thing to protect or double down on

Keep it under 180 words. Sound like a coach who knows them, not a generic motivator.`;

  try {
    const text = await askGemini(prompt, 500);
    aiBod.innerHTML = text.split("\n\n").filter(Boolean)
      .map(p => `<p class="analytics-ai-para">${p.trim()}</p>`).join("");
  } catch(e) {
    aiBod.innerHTML = `<div style="color:#ef4444;font-size:13px">⚠ ${e.message}</div>`;
  }
}

/* ===================== HELPERS ===================== */
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function calcStreak(tasks) {
  // Any day with ANY completed task counts toward streak
  const days = new Set(tasks.filter(t=>t.completed&&t.completedAt).map(t=>localDate(new Date(t.completedAt.seconds?t.completedAt.seconds*1000:t.completedAt))));
  const today = new Date(); let streak = 0;
  for (let i = 0; i <= 365; i++) { const d = new Date(today); d.setDate(today.getDate()-i); if (days.has(localDate(d))) streak++; else if (i>0) break; }
  return streak;
}
function calcMaxStreak(tasks) {
  const days = [...new Set(tasks.filter(t=>t.completed&&t.completedAt).map(t=>localDate(new Date(t.completedAt.seconds?t.completedAt.seconds*1000:t.completedAt))))].sort();
  let max=0, cur=1;
  for (let i=1;i<days.length;i++) {
    const prev=new Date(days[i-1]), curr=new Date(days[i]);
    const diff = (curr-prev) / 86400000;
    if (diff===1) { cur++; max=Math.max(max,cur); } else cur=1;
  }
  return Math.max(max,1);
}
function getBestDay(tasks) {
  const dows=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const counts=Array(7).fill(0);
  tasks.filter(t=>t.completed&&t.completedAt).forEach(t=>{counts[new Date(t.completedAt.seconds?t.completedAt.seconds*1000:t.completedAt).getDay()]++;});
  return dows[counts.indexOf(Math.max(...counts))];
}
function getAvgDailyTasks(tasks, days) {
  const cutoff = Date.now() - days * 86400000;
  const recent = tasks.filter(t=>t.completed&&t.completedAt&&(new Date(t.completedAt.seconds?t.completedAt.seconds*1000:t.completedAt))>cutoff).length;
  return recent / days;
}
function animateNum(el, target, duration) {
  if (!el) return; let start = 0, startTime = null;
  function step(ts) { if (!startTime) startTime=ts; const p=Math.min((ts-startTime)/duration,1); el.textContent=Math.round(start+p*(target-start)); if (p<1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
function generateInsights(tasks, streak, rate, bestDay, maxStreak) {
  const insights = [];
  const topPriority = tasks.filter(t=>!t.completed).sort((a,b)=>(b.priority||0)-(a.priority||0))[0];
  const overdueCount = tasks.filter(t=>!t.completed&&t.dueDate&&new Date(t.dueDate)<new Date()).length;
  if (streak >= 3) insights.push({ icon:"🔥", title:`${streak}-Day Streak!`, body:`You've been consistent for ${streak} days. That's the compound effect in action.` });
  if (overdueCount > 0) insights.push({ icon:"⚠️", title:`${overdueCount} Overdue`, body:`You have ${overdueCount} task${overdueCount>1?"s":""} past their deadline. Tackle the hardest one first.` });
  if (topPriority) insights.push({ icon:"🎯", title:"Top Priority", body:`Your most urgent pending task: "${topPriority.title}"` });
  if (rate >= 70) insights.push({ icon:"✅", title:`${Math.round(rate)}% Completion Rate`, body:"Outstanding. You follow through — that's rarer than most realize." });
  else if (rate < 40) insights.push({ icon:"💡", title:"Completion Opportunity", body:`${Math.round(rate)}% completion rate. Consider whether your task count matches your bandwidth.` });
  if (bestDay && bestDay !== "undefined") insights.push({ icon:"📅", title:`Most Productive: ${bestDay}`, body:`You complete more tasks on ${bestDay}. Consider scheduling your hardest work then.` });
  if (maxStreak >= 7) insights.push({ icon:"🏆", title:`Best Streak: ${maxStreak} Days`, body:`Your longest run of consistency. You've proven you can do it.` });
  return insights.slice(0, 4);
}