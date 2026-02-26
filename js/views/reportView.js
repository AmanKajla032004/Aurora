import { getTasksFromCloud } from "../firebase/firestoreService.js";
import { askGemini } from "../gemini.js";
import { auth } from "../firebase/firebaseConfig.js";

let activePeriod = "day";

export function renderReport() {
  const today = new Date().toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  return `<div class="report-page" id="reportPage">
    <div class="report-header">
      <div>
        <h2 class="report-title">Reports & Insights</h2>
        <div class="report-date-label">${today}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="report-generate-btn" id="reportGenBtn">📊 Show Stats</button>
        <button class="report-ai-btn" id="reportAiBtn" style="display:none">✦ AI Analysis</button>
        <button class="report-export-btn" id="reportExportBtn" style="display:none">⬇ Export</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="report-tab active" data-period="day">📅 Today</button>
      <button class="report-tab" data-period="week">📆 This Week</button>
      <button class="report-tab" data-period="month">🗓 This Month</button>
      <button class="report-tab" data-period="swot">⚡ SWOT</button>
      <button class="report-tab" data-period="history">🗂 Past Reports</button>
    </div>
    <div id="reportAutoNotice" style="display:none" class="report-auto-notice">
      ✦ Auto-report · <span id="reportAutoTime"></span>
    </div>
    <div id="reportContent">
      <div class="report-empty">
        <div style="font-size:44px;margin-bottom:12px">📋</div>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px">Pick a period and click Show Stats</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.7">
          Detailed stats load instantly · Then hit <strong>✦ AI Analysis</strong> for deep insights
        </div>
      </div>
    </div>
  </div>`;
}

export async function initReport() {
  document.querySelectorAll(".report-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      activePeriod = tab.dataset.period;
      document.querySelectorAll(".report-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const aiBtn  = document.getElementById("reportAiBtn");
      const expBtn = document.getElementById("reportExportBtn");
      const genBtn = document.getElementById("reportGenBtn");
      if (activePeriod === "history") {
        if (aiBtn)  aiBtn.style.display  = "none";
        if (expBtn) expBtn.style.display = "none";
        if (genBtn) genBtn.style.display = "none";
        renderPastReports(); return;
      }
      if (genBtn) genBtn.style.display = "inline-flex";
      if (aiBtn)  aiBtn.style.display  = "none";
      if (expBtn) expBtn.style.display = "none";
      const cached = getCachedReport(activePeriod);
      if (cached) showCachedReport(cached);
      else document.getElementById("reportContent").innerHTML = `
        <div class="report-empty">
          <div style="font-size:36px;margin-bottom:10px">📊</div>
          <div style="font-size:14px;color:var(--muted)">Click Show Stats to load your data</div>
        </div>`;
    });
  });

  document.getElementById("reportGenBtn")?.addEventListener("click", () => generateStats());
  document.getElementById("reportAiBtn")?.addEventListener("click", () => generateAI());
  document.getElementById("reportExportBtn")?.addEventListener("click", exportReport);

  const cached = getCachedReport(activePeriod);
  if (cached) showCachedReport(cached);
  scheduleAutoReports();
}

// ─── Stats ────────────────────────────────────────────────────
async function generateStats() {
  const btn = document.getElementById("reportGenBtn");
  const container = document.getElementById("reportContent");
  if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
  container.innerHTML = `<div class="report-loading"><span class="report-spinner"></span> Crunching your data…</div>`;

  let tasks = [];
  try { tasks = await getTasksFromCloud(); } catch(e) {}

  const { statsHtml, meta } = buildStats(tasks);
  if (container) container.innerHTML = statsHtml;
  window._reportMeta = meta;

  const aiBtn  = document.getElementById("reportAiBtn");
  const expBtn = document.getElementById("reportExportBtn");
  if (aiBtn)  aiBtn.style.display  = "inline-flex";
  if (expBtn) expBtn.style.display = "inline-flex";

  setCachedReport(activePeriod, { html: statsHtml, generatedAt: Date.now(), hasAI: false });
  if (btn) { btn.disabled = false; btn.textContent = "📊 Refresh"; }
}

// ─── AI Analysis ─────────────────────────────────────────────
async function generateAI() {
  const btn = document.getElementById("reportAiBtn");
  const container = document.getElementById("reportContent");
  if (!container) return;
  if (btn) { btn.disabled = true; btn.textContent = "✦ Analyzing…"; }

  document.getElementById("reportAiCard")?.remove();

  const aiCard = document.createElement("div");
  aiCard.className = "report-ai-card";
  aiCard.id = "reportAiCard";
  aiCard.innerHTML = `
    <div class="report-ai-header">
      <span class="report-ai-spinner-dot"></span>
      <span class="report-ai-title-text">${activePeriod === "swot" ? "⚡ SWOT Analysis" : "✦ AI Insights"}</span>
      <span style="font-size:11px;color:var(--muted);margin-left:auto">powered by Gemini</span>
    </div>
    <div class="report-ai-body" id="reportAiBody" style="opacity:0.5;font-style:italic">Writing your personalized analysis…</div>`;
  container.appendChild(aiCard);
  aiCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const meta   = window._reportMeta || {};
  const prompt = buildPrompt(meta);

  try {
    const aiText = await askGemini(prompt, 1200);
    const body   = document.getElementById("reportAiBody");
    const spinner = aiCard.querySelector(".report-ai-spinner-dot");
    if (spinner) spinner.remove();
    if (body) {
      body.style.opacity = "1";
      body.style.fontStyle = "normal";
      body.innerHTML = formatAI(aiText);
    }
    const finalHtml = container.innerHTML;
    setCachedReport(activePeriod, { html: finalHtml, generatedAt: Date.now(), hasAI: true });
    if (btn) { btn.textContent = "✦ Regenerate"; btn.disabled = false; }
  } catch(err) {
    const body = document.getElementById("reportAiBody");
    if (body) {
      body.style.opacity = "1"; body.style.fontStyle = "normal";
      body.style.color = "#ef4444";
      body.innerHTML = `⚠ ${err.message}`;
    }
    if (btn) { btn.textContent = "✦ Retry"; btn.disabled = false; }
  }
}

// ─── Build detailed stats ─────────────────────────────────────
function buildStats(tasks) {
  const now = new Date();
  let since, periodLabel, periodTitle;

  if (activePeriod === "day" || activePeriod === "swot") {
    since = new Date(now); since.setHours(0,0,0,0);
    periodLabel = "today"; periodTitle = "Today";
  } else if (activePeriod === "week") {
    since = new Date(now); since.setDate(now.getDate() - 7);
    periodLabel = "the past 7 days"; periodTitle = "This Week";
  } else {
    since = new Date(now); since.setDate(now.getDate() - 30);
    periodLabel = "the past 30 days"; periodTitle = "This Month";
  }

  // Core calculations
  const allDone      = tasks.filter(t => t.completed);
  const doneInPeriod = tasks.filter(t => {
    if (!t.completed || !t.completedAt) return false;
    const d = tsToDate(t.completedAt);
    return d >= since;
  });
  const pending  = tasks.filter(t => !t.completed);
  const overdue  = pending.filter(t => t.dueDate && new Date(t.dueDate) < now);
  const dueSoon  = pending.filter(t => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    const diff = (d - now) / (1000*60*60*24);
    return diff >= 0 && diff <= 3;
  });
  const highPri  = pending.filter(t => (t.priority||0) >= 4);
  const rate     = tasks.length ? Math.round(allDone.length / tasks.length * 100) : 0;

  // Priority breakdown
  const byPriority = [1,2,3,4,5].map(p => ({
    p, total: tasks.filter(t=>(t.priority||1)===p).length,
    done: tasks.filter(t=>(t.priority||1)===p && t.completed).length
  }));

  // Category breakdown
  const catMap = {};
  tasks.forEach(t => {
    const cat = t.type || "other";
    if (!catMap[cat]) catMap[cat] = { total:0, done:0 };
    catMap[cat].total++;
    if (t.completed) catMap[cat].done++;
  });

  // Streak
  const daySet = new Set(allDone.filter(t=>t.completedAt).map(t => tsToDate(t.completedAt).toDateString()));
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now); d.setDate(now.getDate()-i);
    if (daySet.has(d.toDateString())) streak++;
    else if (i > 0) break;
  }

  // Best day this period
  const dayCount = {};
  doneInPeriod.forEach(t => {
    const key = tsToDate(t.completedAt).toDateString();
    dayCount[key] = (dayCount[key]||0) + 1;
  });
  const bestDayKey = Object.keys(dayCount).sort((a,b)=>dayCount[b]-dayCount[a])[0];
  const bestDay    = bestDayKey ? `${bestDayKey} (${dayCount[bestDayKey]} tasks)` : "—";

  // Average tasks/day this period
  const periodDays = activePeriod === "day" ? 1 : activePeriod === "week" ? 7 : 30;
  const avgPerDay  = (doneInPeriod.length / periodDays).toFixed(1);

  const meta = { doneInPeriod, overdue, dueSoon, pending, highPri, streak, rate, tasks, allDone,
                 periodLabel, periodTitle, byPriority, catMap, bestDay, avgPerDay, periodDays };

  const pColors = { 1:"#6b7280", 2:"#60a5fa", 3:"#f59e0b", 4:"#f97316", 5:"#ef4444" };
  const pLabels = { 1:"Minimal", 2:"Low", 3:"Medium", 4:"High", 5:"Critical" };
  const typeIcons = { daily:"🔁", weekly:"📅", monthly:"🗓", yearly:"🎯", custom:"✏️", other:"📌" };

  let html = "";

  if (activePeriod !== "swot") {
    // ── Big stat cards ─────────────────────────────────────
    html += `<div class="report-card">
      <div class="report-section-title">${periodTitle} at a Glance</div>
      <div class="report-stats-grid">
        <div class="report-big-stat">
          <div class="report-big-val" style="color:var(--accent)">${doneInPeriod.length}</div>
          <div class="report-big-lbl">Tasks Completed</div>
        </div>
        <div class="report-big-stat">
          <div class="report-big-val">${pending.length}</div>
          <div class="report-big-lbl">Still Pending</div>
        </div>
        <div class="report-big-stat">
          <div class="report-big-val" style="color:${overdue.length>0?"#ef4444":"var(--accent)"}">${overdue.length}</div>
          <div class="report-big-lbl">Overdue</div>
        </div>
        <div class="report-big-stat">
          <div class="report-big-val">${streak}🔥</div>
          <div class="report-big-lbl">Day Streak</div>
        </div>
        <div class="report-big-stat">
          <div class="report-big-val">${rate}%</div>
          <div class="report-big-lbl">Overall Rate</div>
        </div>
        <div class="report-big-stat">
          <div class="report-big-val">${avgPerDay}</div>
          <div class="report-big-lbl">Avg / Day</div>
        </div>
      </div>
      <div class="report-progress-wrap">
        <div class="report-progress-label"><span>Overall completion</span><span>${allDone.length} / ${tasks.length} tasks</span></div>
        <div class="report-progress-track"><div class="report-progress-fill" style="width:${rate}%"></div></div>
      </div>
    </div>`;

    // ── Priority breakdown ─────────────────────────────────
    const activePriorities = byPriority.filter(p => p.total > 0);
    if (activePriorities.length > 0) {
      html += `<div class="report-card">
        <div class="report-section-title">🎯 Priority Breakdown</div>
        <div class="report-priority-list">
          ${activePriorities.map(p => {
            const r = p.total ? Math.round(p.done/p.total*100) : 0;
            return `<div class="report-priority-row">
              <div class="report-priority-label">
                <span class="report-priority-dot" style="background:${pColors[p.p]}"></span>
                <span>${pLabels[p.p]}</span>
              </div>
              <div class="report-priority-bar-wrap">
                <div class="report-priority-bar" style="width:${r}%;background:${pColors[p.p]}"></div>
              </div>
              <div class="report-priority-nums">${p.done}/${p.total} <span style="color:var(--muted)">(${r}%)</span></div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }

    // ── Task type breakdown ────────────────────────────────
    const cats = Object.entries(catMap).filter(([,v]) => v.total > 0);
    if (cats.length > 1) {
      html += `<div class="report-card">
        <div class="report-section-title">📂 By Category</div>
        <div class="report-cat-grid">
          ${cats.map(([cat, v]) => {
            const r = Math.round(v.done/v.total*100);
            return `<div class="report-cat-item">
              <div class="report-cat-icon">${typeIcons[cat]||"📌"}</div>
              <div class="report-cat-name">${cat}</div>
              <div class="report-cat-val">${v.done}/${v.total}</div>
              <div class="report-cat-bar-track"><div class="report-cat-bar-fill" style="width:${r}%"></div></div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }

    // ── Completed list ─────────────────────────────────────
    if (doneInPeriod.length > 0) {
      html += `<div class="report-card">
        <div class="report-section-title">✅ Completed ${periodTitle === "Today" ? "Today" : "This Period"} (${doneInPeriod.length})</div>
        <div class="report-task-list">
          ${doneInPeriod.slice(0,12).map(t => `
            <div class="report-task-item report-task-done">
              <span class="report-task-dot" style="background:${pColors[t.priority||1]}"></span>
              <span class="report-task-name">${esc(t.title)}</span>
              ${t.completedAt ? `<span class="report-task-time">${tsToDate(t.completedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>` : ""}
            </div>`).join("")}
          ${doneInPeriod.length > 12 ? `<div style="font-size:12px;color:var(--muted);padding:6px 0">+ ${doneInPeriod.length-12} more</div>` : ""}
        </div>
        ${periodTitle !== "Today" ? `<div class="report-best-day">🏆 Best day: ${bestDay}</div>` : ""}
      </div>`;
    }

    // ── Overdue tasks ──────────────────────────────────────
    if (overdue.length > 0) {
      html += `<div class="report-card report-card-danger">
        <div class="report-section-title" style="color:#ef4444">⚠ Overdue (${overdue.length})</div>
        <div class="report-task-list">
          ${overdue.slice(0,8).map(t => {
            const daysLate = Math.ceil((now - new Date(t.dueDate)) / (1000*60*60*24));
            return `<div class="report-task-item">
              <span class="report-task-dot" style="background:#ef4444"></span>
              <span class="report-task-name">${esc(t.title)}</span>
              <span class="report-task-badge report-task-badge-red">${daysLate}d late</span>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }

    // ── Due soon ───────────────────────────────────────────
    if (dueSoon.length > 0) {
      html += `<div class="report-card report-card-warn">
        <div class="report-section-title" style="color:#f59e0b">⏰ Due Soon (next 3 days)</div>
        <div class="report-task-list">
          ${dueSoon.slice(0,6).map(t => {
            const diff = Math.ceil((new Date(t.dueDate) - now) / (1000*60*60*24));
            return `<div class="report-task-item">
              <span class="report-task-dot" style="background:#f59e0b"></span>
              <span class="report-task-name">${esc(t.title)}</span>
              <span class="report-task-badge report-task-badge-yellow">${diff === 0 ? "today" : `${diff}d`}</span>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }

    // ── High priority pending ──────────────────────────────
    if (highPri.length > 0) {
      html += `<div class="report-card">
        <div class="report-section-title">🔥 High Priority Pending</div>
        <div class="report-task-list">
          ${highPri.slice(0,6).map(t => `
            <div class="report-task-item">
              <span class="report-task-dot" style="background:${pColors[t.priority||4]}"></span>
              <span class="report-task-name">${esc(t.title)}</span>
              <span class="report-task-badge" style="background:rgba(239,68,68,0.15);color:#ef4444">P${t.priority}</span>
            </div>`).join("")}
        </div>
      </div>`;
    }

    // ── Nothing to show ────────────────────────────────────
    if (doneInPeriod.length === 0 && overdue.length === 0 && pending.length === 0) {
      html += `<div class="report-card">
        <div style="text-align:center;padding:20px;color:var(--muted);font-size:14px">
          No tasks found — start adding tasks to track your productivity ✨
        </div>
      </div>`;
    }

  } else {
    // ── SWOT overview stats ────────────────────────────────
    html += `<div class="report-card">
      <div class="report-section-title">📊 Full Overview</div>
      <div class="report-stats-grid">
        <div class="report-big-stat"><div class="report-big-val">${tasks.length}</div><div class="report-big-lbl">Total Tasks</div></div>
        <div class="report-big-stat"><div class="report-big-val" style="color:var(--accent)">${allDone.length}</div><div class="report-big-lbl">Completed</div></div>
        <div class="report-big-stat"><div class="report-big-val">${pending.length}</div><div class="report-big-lbl">Pending</div></div>
        <div class="report-big-stat"><div class="report-big-val" style="color:${overdue.length>0?"#ef4444":"var(--accent)"}">${overdue.length}</div><div class="report-big-lbl">Overdue</div></div>
        <div class="report-big-stat"><div class="report-big-val">${rate}%</div><div class="report-big-lbl">Rate</div></div>
        <div class="report-big-stat"><div class="report-big-val">${streak}🔥</div><div class="report-big-lbl">Streak</div></div>
      </div>
      <div class="report-progress-wrap">
        <div class="report-progress-label"><span>Overall progress</span><span>${rate}%</span></div>
        <div class="report-progress-track"><div class="report-progress-fill" style="width:${rate}%"></div></div>
      </div>
    </div>`;
  }

  return { statsHtml: html, meta };
}

// ─── Rich AI prompt ───────────────────────────────────────────
function buildPrompt(meta) {
  const { doneInPeriod=[], overdue=[], dueSoon=[], pending=[], highPri=[],
          streak=0, rate=0, tasks=[], allDone=[], periodLabel="today",
          byPriority=[], catMap={}, bestDay="—", avgPerDay=0, periodDays=1 } = meta;

  const username = auth.currentUser?.email?.split("@")[0] || "user";
  const totalTasks = tasks.length;
  const completedTotal = allDone.length;

  // Build rich context
  const completedNames  = doneInPeriod.slice(0,10).map(t=>t.title).join(", ") || "none";
  const overdueNames    = overdue.slice(0,5).map(t => `${t.title} (${Math.ceil((new Date()-new Date(t.dueDate))/(1000*60*60*24))}d overdue)`).join(", ") || "none";
  const highPriNames    = highPri.slice(0,5).map(t=>t.title).join(", ") || "none";
  const dueSoonNames    = dueSoon.slice(0,5).map(t=>t.title).join(", ") || "none";

  const catBreakdown = Object.entries(catMap)
    .filter(([,v]) => v.total > 0)
    .map(([cat,v]) => `${cat}: ${v.done}/${v.total} done`)
    .join(", ");

  const priorityBreakdown = byPriority
    .filter(p => p.total > 0)
    .map(p => `P${p.p}: ${p.done}/${p.total}`)
    .join(", ");

  if (activePeriod === "swot") {
    return `You are a productivity coach writing a SWOT analysis for ${username}.

USER DATA:
- Total tasks: ${totalTasks} | Completed: ${completedTotal} (${rate}%) | Pending: ${pending.length} | Overdue: ${overdue.length}
- Current streak: ${streak} days
- Priority breakdown: ${priorityBreakdown || "N/A"}
- Category breakdown: ${catBreakdown || "N/A"}
- Overdue tasks: ${overdueNames}
- High priority pending: ${highPriNames}
- Recent completions: ${completedNames}

Write a detailed, personal, insightful SWOT analysis. Be specific — reference the actual tasks and numbers above. Be encouraging but honest. Each section should be 3-4 sentences with concrete observations.

Format exactly like this (use these exact headers):

STRENGTHS
[write 3-4 sentences about what they're doing well, referencing specific data]

WEAKNESSES
[write 3-4 sentences about areas to improve, be specific and actionable]

OPPORTUNITIES
[write 3-4 sentences about what they could do to improve their productivity]

THREATS
[write 3-4 sentences about risks — overdue tasks, patterns, burnout signals etc.]

ACTION PLAN
[write 3 specific numbered action items they should do this week]`;
  }

  const periodName = activePeriod === "day" ? "end-of-day" : activePeriod === "week" ? "weekly" : "monthly";

  return `You are a productivity coach writing a ${periodName} report for ${username}.

USER DATA FOR ${periodLabel.toUpperCase()}:
- Completed this period: ${doneInPeriod.length} tasks (${avgPerDay}/day average)
- Completed tasks: ${completedNames}
- Still pending: ${pending.length} tasks
- Overdue: ${overdue.length} tasks — ${overdueNames}
- Due soon (3 days): ${dueSoon.length} tasks — ${dueSoonNames}
- High priority pending: ${highPri.length} — ${highPriNames}
- Current streak: ${streak} days | Overall rate: ${rate}% (${completedTotal}/${totalTasks} all-time)
- Best day this period: ${bestDay}
- Priority breakdown: ${priorityBreakdown || "N/A"}
- Category breakdown: ${catBreakdown || "N/A"}

Write a detailed, personal ${periodName} productivity report. Be specific — reference the actual tasks and numbers. Be encouraging but honest. Each section 3-5 sentences.

Format exactly like this:

WINS
[What they accomplished — be specific, celebrate their completions, mention tasks by name]

WATCH OUT
[Honest assessment of overdue items, patterns of avoidance, what needs attention. Be specific.]

FOCUS FOR ${activePeriod === "day" ? "TOMORROW" : "NEXT " + (activePeriod === "week" ? "WEEK" : "MONTH")}
[3-4 specific, actionable recommendations based on their actual pending/high-priority tasks]

PATTERN INSIGHT
[One insightful observation about their productivity patterns, work style, or habits based on the data]`;
}

function formatAI(text) {
  return text
    .replace(/^(WINS|WATCH OUT|STRENGTHS|WEAKNESSES|OPPORTUNITIES|THREATS|ACTION PLAN|PATTERN INSIGHT|FOCUS FOR .+?)$/gm,
      '<div class="report-ai-section-title">$1</div>')
    .replace(/^\d+\.\s/gm, '<span class="report-ai-number">$&</span>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function tsToDate(ts) {
  if (!ts) return new Date(0);
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ─── Auto end-of-period reports ───────────────────────────────
function scheduleAutoReports() {
  const now = new Date();
  const eod = new Date(now); eod.setHours(23,58,0,0);
  if (eod > now) setTimeout(() => runAutoReport("day"), eod - now);
  const dow = now.getDay();
  const eow = new Date(now); eow.setDate(now.getDate()+(7-dow)%7); eow.setHours(23,58,0,0);
  if (eow > now) setTimeout(() => runAutoReport("week"), eow - now);
  const eom = new Date(now.getFullYear(), now.getMonth()+1, 0); eom.setHours(23,58,0,0);
  if (eom > now) setTimeout(() => runAutoReport("month"), eom - now);
}

async function runAutoReport(period) {
  const cached = getCachedReport(period);
  if (cached?.hasAI) return;
  const prev = activePeriod; activePeriod = period;
  let tasks = [];
  try { tasks = await getTasksFromCloud(); } catch(e) { activePeriod = prev; return; }
  const { statsHtml, meta } = buildStats(tasks);
  window._reportMeta = meta;
  try {
    const aiText  = await askGemini(buildPrompt(meta), 1200);
    const aiSection = `<div class="report-ai-card" id="reportAiCard">
      <div class="report-ai-header"><span class="report-ai-title-text">✦ AI Analysis — Auto Generated</span></div>
      <div class="report-ai-body">${formatAI(aiText)}</div>
    </div>`;
    setCachedReport(period, { html: statsHtml + aiSection, generatedAt: Date.now(), hasAI: true, isAuto: true });
  } catch { setCachedReport(period, { html: statsHtml, generatedAt: Date.now(), hasAI: false }); }
  activePeriod = prev;
}

// ─── Cache ────────────────────────────────────────────────────
function getCachedReport(period) {
  try { const r = localStorage.getItem(`aurora_report_${period}_${todayKey()}`); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function setCachedReport(period, data) {
  try { localStorage.setItem(`aurora_report_${period}_${todayKey()}`, JSON.stringify(data)); } catch {}
}
function showCachedReport(cached) {
  const container = document.getElementById("reportContent");
  if (container && cached.html) container.innerHTML = cached.html;
  const aiBtn  = document.getElementById("reportAiBtn");
  const expBtn = document.getElementById("reportExportBtn");
  if (aiBtn)  aiBtn.style.display  = cached.hasAI ? "none" : "inline-flex";
  if (expBtn) expBtn.style.display = "inline-flex";
  const notice = document.getElementById("reportAutoNotice");
  if (notice && cached.isAuto) {
    notice.style.display = "block";
    const el = document.getElementById("reportAutoTime");
    if (el) el.textContent = "auto · " + new Date(cached.generatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  }
}
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

// ─── Past Reports ─────────────────────────────────────────────
function getAllStoredReports() {
  const reports = [];
  const periodLabels = { day:"Daily", week:"Weekly", month:"Monthly", swot:"SWOT" };
  const periodIcons  = { day:"📅", week:"📆", month:"🗓", swot:"⚡" };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("aurora_report_")) continue;
    const parts = key.replace("aurora_report_","").split("_");
    if (parts.length < 2) continue;
    const period = parts[0]; const dateKey = parts[1];
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (!data?.html) continue;
      const [yr,mo,dy] = dateKey.split("-").map(Number);
      reports.push({ key, period, date: new Date(yr,mo,dy), data, label: periodLabels[period]||period, icon: periodIcons[period]||"📋" });
    } catch {}
  }
  return reports.sort((a,b) => b.date - a.date);
}

function renderPastReports() {
  const container = document.getElementById("reportContent");
  if (!container) return;
  const reports = getAllStoredReports();
  if (!reports.length) {
    container.innerHTML = `<div class="report-empty"><div style="font-size:44px;margin-bottom:12px">🗂</div>
      <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px">No past reports yet</div>
      <div style="font-size:13px;color:var(--muted)">Generate reports from the tabs above — they'll appear here.</div></div>`;
    return;
  }
  const groups = {};
  reports.forEach(r => { if (!groups[r.period]) groups[r.period] = []; groups[r.period].push(r); });
  const order = ["day","week","month","swot"];
  const titles = { day:"Daily", week:"Weekly", month:"Monthly", swot:"SWOT" };
  const icons  = { day:"📅", week:"📆", month:"🗓", swot:"⚡" };
  let html = "";
  order.forEach(period => {
    if (!groups[period]) return;
    html += `<div class="report-history-group"><div class="report-history-group-title">${icons[period]} ${titles[period]} Reports</div>`;
    groups[period].forEach(r => {
      const dateStr = r.date.toLocaleDateString("en-US",{weekday:"short",year:"numeric",month:"short",day:"numeric"});
      const timeStr = r.data.generatedAt ? new Date(r.data.generatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "";
      html += `<div class="report-history-item">
        <div class="report-hist-info">
          <div class="report-hist-title">${r.label} — ${dateStr}</div>
          <div class="report-hist-meta">${timeStr} ${r.data.hasAI?'<span class="report-hist-badge">✦ AI</span>':""}</div>
        </div>
        <div class="report-hist-actions">
          <button class="report-hist-view-btn" data-hkey="${r.key}">View</button>
          <button class="report-hist-del-btn" data-hkey="${r.key}" title="Delete">✕</button>
        </div>
      </div>`;
    });
    html += "</div>";
  });
  container.innerHTML = html;
  container.querySelectorAll(".report-hist-view-btn").forEach(btn => {
    btn.onclick = () => {
      const data = JSON.parse(localStorage.getItem(btn.dataset.hkey)||"{}");
      showHistoryModal(data, btn.closest(".report-history-item").querySelector(".report-hist-title").textContent);
    };
  });
  container.querySelectorAll(".report-hist-del-btn").forEach(btn => {
    btn.onclick = () => {
      if (!confirm("Delete this report?")) return;
      localStorage.removeItem(btn.dataset.hkey);
      const item  = btn.closest(".report-history-item"); item.remove();
      const group = item?.closest?.(".report-history-group");
      if (group && !group.querySelector(".report-history-item")) group.remove();
    };
  });
}

function showHistoryModal(data, title) {
  document.getElementById("reportHistModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "reportHistModal";
  modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px";
  modal.innerHTML = `<div style="background:var(--surface);border-radius:20px;padding:28px;max-width:700px;width:100%;max-height:82vh;overflow-y:auto;position:relative">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div style="font-size:15px;font-weight:700;color:var(--text)">${title}</div>
      <button id="histModalClose" style="background:transparent;border:none;font-size:22px;cursor:pointer;color:var(--muted)">&times;</button>
    </div>
    <div>${data.html||""}</div>
  </div>`;
  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target===modal) modal.remove(); };
  document.getElementById("histModalClose").onclick = () => modal.remove();
}

function exportReport() {
  const container = document.getElementById("reportContent");
  if (!container) return;
  const labels = { day:"Daily", week:"Weekly", month:"Monthly", swot:"SWOT" };
  const label  = labels[activePeriod]||"Report";
  const parts  = ["AURORA PLANNER — "+label.toUpperCase()+" REPORT", new Date().toDateString(), "=".repeat(50), ""];
  container.querySelectorAll(".report-card, .report-ai-card").forEach(card => {
    const title = card.querySelector(".report-section-title,.report-ai-section-title,.report-ai-title-text");
    const body  = card.querySelector(".report-ai-body,.report-task-list,.report-stats-grid");
    if (title) parts.push("\n" + title.textContent.trim().toUpperCase());
    if (body)  parts.push(body.innerText.trim());
    parts.push("");
  });
  const blob = new Blob([parts.join("\n")], {type:"text/plain"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `aurora-${label.toLowerCase()}-${new Date().toISOString().slice(0,10)}.txt`;
  a.click(); URL.revokeObjectURL(url);
}
