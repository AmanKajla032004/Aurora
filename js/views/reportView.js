import { getTasksFromCloud } from "../firebase/firestoreService.js";
import { getWellbeingForReport } from "./wellbeingView.js";
import { askGemini } from "../gemini.js";

let activePeriod = "day";

export function renderReport() {
  const today = new Date().toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  return `<div class="report-page" id="reportPage">

    <div class="report-header">
      <div>
        <h2 class="report-title">Reports</h2>
        <div class="report-date-label">${today}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="report-generate-btn" id="reportGenBtn">📊 Show Stats</button>
        <button class="report-ai-btn" id="reportAiBtn" style="display:none">✦ Ask AI</button>
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
          Stats load instantly from your tasks.<br>
          Then hit <strong>✦ Ask AI</strong> for a written analysis — uses one AI request.
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
        renderPastReports();
        return;
      }

      if (genBtn) genBtn.style.display = "inline-flex";
      if (aiBtn)  aiBtn.style.display  = "none";
      if (expBtn) expBtn.style.display = "none";

      const cached = getCachedReport(activePeriod);
      if (cached) {
        showCachedReport(cached);
      } else {
        document.getElementById("reportContent").innerHTML = `
          <div class="report-empty">
            <div style="font-size:36px;margin-bottom:10px">📊</div>
            <div style="font-size:14px;color:var(--muted)">Click Show Stats to load your ${tab.textContent.trim()} data</div>
          </div>`;
      }
    });
  });

  document.getElementById("reportGenBtn")?.addEventListener("click", () => generateStats());
  document.getElementById("reportAiBtn")?.addEventListener("click", () => generateAI());
  document.getElementById("reportExportBtn")?.addEventListener("click", exportReport);

  // Restore cached report for current tab
  const cached = getCachedReport(activePeriod);
  if (cached) showCachedReport(cached);

  // Schedule end-of-period auto reports
  scheduleAutoReports(); // async — runs in background, doesn't block UI
}

// ─── Stats (instant, no AI) ───────────────────────────────────
async function generateStats() {
  const btn = document.getElementById("reportGenBtn");
  const container = document.getElementById("reportContent");
  if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }

  let tasks = [];
  try { tasks = await getTasksFromCloud(); } catch(e) {}

  // Also fetch wellbeing data for enriched report
  const wellbeing = await getWellbeingForReport(7).catch(() => null);

  const { statsHtml, meta } = buildStats(tasks);
  meta.wellbeing = wellbeing;
  if (container) container.innerHTML = statsHtml;

  // Store meta for AI use
  window._reportMeta = meta;

  // Show AI button
  const aiBtn = document.getElementById("reportAiBtn");
  if (aiBtn) aiBtn.style.display = "inline-flex";
  const expBtn = document.getElementById("reportExportBtn");
  if (expBtn) expBtn.style.display = "inline-flex";

  // Cache stats-only
  setCachedReport(activePeriod, { html: statsHtml, generatedAt: Date.now(), hasAI: false });

  if (btn) { btn.disabled = false; btn.textContent = "📊 Refresh"; }
}

// ─── AI narrative (separate, on-demand) ──────────────────────
async function generateAI() {
  const btn = document.getElementById("reportAiBtn");
  const container = document.getElementById("reportContent");
  if (!container) return;
  if (btn) { btn.disabled = true; btn.textContent = "✦ Thinking…"; }

  // Remove any existing AI card
  const existing = document.getElementById("reportAiCard");
  if (existing) existing.remove();

  // Add spinner card
  const aiCard = document.createElement("div");
  aiCard.className = "report-ai-card";
  aiCard.id = "reportAiCard";
  aiCard.innerHTML = `
    <div class="report-ai-header">
      <span class="report-ai-spinner" id="reportSpinner"></span>
      <span class="report-ai-title-text">${activePeriod === "swot" ? "⚡ SWOT Analysis" : "✦ AI Insights"}</span>
    </div>
    <div class="report-ai-body" id="reportAiBody" style="opacity:0.5;font-style:italic">Writing your report…</div>`;
  container.appendChild(aiCard);
  aiCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const meta = window._reportMeta || {};
  const prompt = buildPrompt(meta);

  try {
    const aiText = await askGemini(prompt, 800);
    const spinner = document.getElementById("reportSpinner");
    const body    = document.getElementById("reportAiBody");
    if (spinner) spinner.remove();
    if (body) {
      body.style.opacity = "1";
      body.style.fontStyle = "normal";
      const formatted = aiText.replace(
        /^(WINS|WATCH OUT|NEXT STEPS|STRENGTHS|WEAKNESSES|OPPORTUNITIES|THREATS)\s*$/gm,
        '<strong style="color:var(--accent);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;display:block;margin:14px 0 5px">$1</strong>'
      );
      body.innerHTML = formatted;
    }
    // Update cache with AI included
    const finalHtml = container.innerHTML || "";
    setCachedReport(activePeriod, { html: finalHtml, generatedAt: Date.now(), hasAI: true });
    if (btn) { btn.textContent = "✦ Regenerate AI"; btn.disabled = false; }
  } catch(err) {
    const body = document.getElementById("reportAiBody");
    if (body) {
      body.style.opacity = "1";
      body.style.fontStyle = "normal";
      body.style.color = "#ef4444";
      body.innerHTML = `⚠ ${err.message}`;
    }
    if (btn) { btn.textContent = "✦ Retry AI"; btn.disabled = false; }
  }
}

// ─── Build stats from tasks (no AI) ──────────────────────────
function buildStats(tasks, refDate) {
  const now = refDate || new Date();
  let since, periodLabel, periodTitle;

  if (activePeriod === "day" || activePeriod === "swot") {
    since = new Date(now); since.setHours(0,0,0,0);
    periodLabel = "today"; periodTitle = "Today";
  } else if (activePeriod === "week") {
    since = new Date(now); since.setDate(now.getDate() - now.getDay()); since.setHours(0,0,0,0);
    periodLabel = "this week"; periodTitle = "This Week";
  } else {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
    periodLabel = "this month"; periodTitle = "This Month";
  }

  // Correct local-time deadline builder (no UTC shift)
  const buildDeadline = (dueDate, dueTime) => {
    if (!dueDate) return null;
    const dp = dueDate.length > 10 ? dueDate.slice(0,10) : dueDate;
    const [y,mo,d] = dp.split("-").map(Number);
    if (dueTime) { const [h,m] = dueTime.split(":").map(Number); return new Date(y,mo-1,d,h,m); }
    return new Date(y, mo-1, d, 23, 59, 59, 999);
  };

  const completedInPeriod = tasks.filter(t => {
    if (!t.completed || !t.completedAt) return false;
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds * 1000 : t.completedAt);
    return d >= since && d <= now;
  });

  // For daily report — only count tasks that were actually due today (or have no due date but are daily/once)
  // For weekly/monthly — count tasks due within that period
  const overdue = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    if (activePeriod === "day") {
      // Daily report: only show tasks due today or earlier (not future weekly/monthly goals)
      const dl = buildDeadline(t.dueDate, t.dueTime);
      const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
      return dl && dl < now && dl <= endOfToday;
    }
    const dl = buildDeadline(t.dueDate, t.dueTime);
    return dl && dl < now;
  });

  const pending = tasks.filter(t => !t.completed);
  const highPri = pending.filter(t => (t.priority||0) >= 4).slice(0, 5);
  const rate    = tasks.length ? Math.round(tasks.filter(t=>t.completed).length / tasks.length * 100) : 0;

  // Streak
  const daySet = new Set(tasks.filter(t=>t.completed&&t.completedAt).map(t=>{
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    return d.toDateString();
  }));
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now); d.setDate(now.getDate()-i);
    if (daySet.has(d.toDateString())) streak++;
    else if (i > 0) break;
  }

  const meta = { completedInPeriod, overdue, pending, highPri, streak, rate, tasks, periodLabel, periodTitle };

  let html = "";

  // Wellbeing summary card
  if (meta.wellbeing && activePeriod !== "swot") {
    const wb2 = meta.wellbeing;
    const moodBar = wb2.avgMood ? Math.round((wb2.avgMood/7)*100) : 0;
    const energyBar = wb2.avgEnergy ? Math.round((wb2.avgEnergy/6)*100) : 0;
    html += `<div class="report-card" style="border-color:rgba(0,200,122,0.2)">
      <div class="report-section-title">🌿 Wellbeing (past 7 days)</div>
      <div class="report-stats-row">
        ${wb2.avgMood   ? `<div class="report-stat"><div class="report-stat-val">${wb2.avgMood}/7</div><div class="report-stat-lbl">Mood</div></div>` : ""}
        ${wb2.avgEnergy ? `<div class="report-stat"><div class="report-stat-val">${wb2.avgEnergy}/6</div><div class="report-stat-lbl">Energy</div></div>` : ""}
        ${wb2.avgStress ? `<div class="report-stat"><div class="report-stat-val" style="color:${wb2.avgStress>3?"#f97316":"var(--accent)"}">${wb2.avgStress}/5</div><div class="report-stat-lbl">Stress</div></div>` : ""}
        ${wb2.avgSleep  ? `<div class="report-stat"><div class="report-stat-val">${wb2.avgSleep}h</div><div class="report-stat-lbl">Sleep</div></div>` : ""}
      </div>
    </div>`;
  }

  if (activePeriod !== "swot") {
    html += `<div class="report-card">
      <div class="report-section-title">${periodTitle} at a Glance</div>
      <div class="report-stats-row">
        <div class="report-stat"><div class="report-stat-val">${completedInPeriod.length}</div><div class="report-stat-lbl">Done</div></div>
        <div class="report-stat"><div class="report-stat-val">${pending.length}</div><div class="report-stat-lbl">Pending</div></div>
        <div class="report-stat"><div class="report-stat-val" style="color:${overdue.length>0?"#ef4444":"var(--accent)"}">${overdue.length}</div><div class="report-stat-lbl">Overdue</div></div>
        <div class="report-stat"><div class="report-stat-val">${streak}d</div><div class="report-stat-lbl">Streak</div></div>
      </div>
    </div>`;
    if (completedInPeriod.length > 0) {
      html += `<div class="report-card">
        <div class="report-section-title">✓ Completed ${periodTitle === "Today" ? "Today" : "This Period"}</div>
        <div class="report-body">${completedInPeriod.map(t=>t.title).join("\n")}</div>
      </div>`;
    }
    if (overdue.length > 0) {
      html += `<div class="report-card" style="border-color:rgba(239,68,68,0.3)">
        <div class="report-section-title" style="color:#ef4444">⚠ Overdue</div>
        <div class="report-body">${overdue.slice(0,6).map(t=>t.title+(t.dueDate?" ("+new Date(t.dueDate).toLocaleDateString()+")":"")).join("\n")}</div>
      </div>`;
    }
    if (highPri.length > 0) {
      html += `<div class="report-card">
        <div class="report-section-title">🎯 High Priority</div>
        <div class="report-body">${highPri.map(t=>t.title).join("\n")}</div>
      </div>`;
    }
    if (completedInPeriod.length === 0 && overdue.length === 0) {
      html += `<div class="report-card">
        <div style="text-align:center;padding:12px 0;color:var(--muted);font-size:13px">
          ${pending.length > 0 ? `You have ${pending.length} task${pending.length>1?"s":""} to work on — go get them! 💪` : "All clear — nothing pending ✨"}
        </div>
      </div>`;
    }
  } else {
    // SWOT overview stats
    html += `<div class="report-card">
      <div class="report-section-title">📊 Your Task Overview</div>
      <div class="report-stats-row">
        <div class="report-stat"><div class="report-stat-val">${tasks.length}</div><div class="report-stat-lbl">Total</div></div>
        <div class="report-stat"><div class="report-stat-val">${tasks.filter(t=>t.completed).length}</div><div class="report-stat-lbl">Done</div></div>
        <div class="report-stat"><div class="report-stat-val" style="color:${overdue.length>0?"#ef4444":"var(--accent)"}">${overdue.length}</div><div class="report-stat-lbl">Overdue</div></div>
        <div class="report-stat"><div class="report-stat-val">${rate}%</div><div class="report-stat-lbl">Rate</div></div>
      </div>
    </div>`;
  }

  return { statsHtml: html, meta };
}

// ─── Minimal prompt (to save tokens) ─────────────────────────
function buildPrompt(meta) {
  const { completedInPeriod=[], overdue=[], pending=[], highPri=[], streak=0, rate=0, tasks=[], periodLabel="today" } = meta;

  if (activePeriod === "swot") {
    return `Productivity SWOT analysis. Plain text, no markdown dashes.
Data: ${tasks.length} total tasks, ${tasks.filter(t=>t.completed).length} completed (${rate}%), ${overdue.length} overdue, ${streak} day streak.
Recent completions: ${completedInPeriod.slice(0,5).map(t=>t.title).join(", ")||"none"}.
Overdue: ${overdue.slice(0,3).map(t=>t.title).join(", ")||"none"}.

Write 4 sections exactly as labelled, 2-3 sentences each:
STRENGTHS
WEAKNESSES
OPPORTUNITIES
THREATS`;
  }

  const periodName = activePeriod === "day" ? "end-of-day" : activePeriod === "week" ? "weekly" : "monthly";
  const wb = meta?.wellbeing;
  const wbLine = wb ? `\nWellbeing (avg 7d): mood=${wb.avgMood}/7, energy=${wb.avgEnergy}/6, stress=${wb.avgStress}/5, sleep=${wb.avgSleep}h, water=${wb.avgWater} glasses.` : "";
  const taskLabel = t => t.title + (t.description ? ` (${t.description})` : "");
  const dailyNote = activePeriod === "day"
    ? "\nImportant: Focus only on TODAY\'s activity. Long-term goals (weekly/monthly/yearly tasks) are ongoing — acknowledge progress, not failure."
    : "";
  const pendingCount = activePeriod === "day"
    ? pending.filter(t => t.type === "daily" || t.type === "once").length
    : pending.length;

  return `${periodName} productivity report. Plain text, no markdown dashes.${dailyNote}${wbLine}
${periodLabel}: completed ${completedInPeriod.length} tasks${completedInPeriod.length?": "+completedInPeriod.slice(0,4).map(taskLabel).join(", "):""}.
Pending: ${pendingCount}. Overdue: ${overdue.length}${overdue.length?": "+overdue.slice(0,2).map(taskLabel).join(", "):""}. Streak: ${streak}d. Rate: ${rate}%.
High priority: ${highPri.slice(0,3).map(taskLabel).join(", ")||"none"}.

Write 3 sections exactly as labelled, 2-3 sentences each:
WINS
WATCH OUT
NEXT STEPS`;
}

// ─── Auto end-of-period reports ───────────────────────────────
// Strategy: check on every page load if a report was missed since last visit.
// Also schedule timers for current session if the app stays open.
// ─── Helper: local date key "YYYYMMDD" ───────────────────────
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}${m}${day}`;
}

// ─── Save a report for a specific date ───────────────────────
function saveReportForDate(period, dateStr, htmlContent) {
  try {
    localStorage.setItem(`aurora_report_${period}_${dateStr}`,
      JSON.stringify({ html: htmlContent, generatedAt: Date.now(), hasAI: true, isAuto: true }));
  } catch(e) {}
}

// ─── Check if a report exists for a given date key ───────────
function hasReportForDate(period, dateStr) {
  try { return !!localStorage.getItem(`aurora_report_${period}_${dateStr}`); }
  catch(e) { return false; }
}

// ─── Generate a report for a past date ───────────────────────
async function generateReportForDate(period, forDate, tasks) {
  const savedPeriod = activePeriod;
  activePeriod = period;
  const { statsHtml, meta } = buildStats(tasks, forDate);
  activePeriod = savedPeriod;

  try {
    const prompt = buildPrompt(meta);
    const aiText = await askGemini(prompt, 600);
    const aiSection = `<div class="report-ai-card">
      <div class="report-ai-header">
        <span class="report-ai-title-text">✦ ${period === "day" ? "Daily" : period === "week" ? "Weekly" : "Monthly"} Report — ${forDate.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
      </div>
      <div class="report-ai-body">${formatAI(aiText)}</div>
    </div>`;
    saveReportForDate(period, dateKey(forDate), statsHtml + aiSection);
  } catch(e) {
    // Save stats-only on AI failure
    saveReportForDate(period, dateKey(forDate), statsHtml);
  }
}

// ─── Main: check on every app open if any reports are missing ─
export async function checkAndGenerateMissedReports() { return scheduleAutoReports(); }

async function scheduleAutoReports() {
  const now = new Date();
  const lastVisitMs = parseInt(localStorage.getItem("aurora_last_visit") || "0");
  localStorage.setItem("aurora_last_visit", now.getTime().toString());

  // No previous visit — nothing to backfill
  if (!lastVisitMs) return;

  const last = new Date(lastVisitMs);

  // Don't check if last visit was today (nothing to backfill yet)
  if (dateKey(last) === dateKey(now)) {
    // But still schedule end-of-day timer for tonight
    scheduleTimer(now);
    return;
  }

  // Fetch tasks once — reuse for all report generation
  let tasks = [];
  try { tasks = await getTasksFromCloud(); } catch(e) { return; }

  // ── Daily: generate for every missed day between last visit and today ──
  const dayMs = 86400000;
  let cursor = new Date(last);
  cursor.setHours(23, 59, 0, 0); // end of that day
  while (cursor < now) {
    const dk = dateKey(cursor);
    if (dk !== dateKey(now) && !hasReportForDate("day", dk)) {
      await generateReportForDate("day", new Date(cursor), tasks);
    }
    cursor = new Date(cursor.getTime() + dayMs);
  }

  // ── Weekly: generate if we crossed a week boundary ──
  const lastWeekStart = new Date(last); lastWeekStart.setDate(last.getDate() - last.getDay());
  const nowWeekStart  = new Date(now);  nowWeekStart.setDate(now.getDate() - now.getDay());
  if (lastWeekStart.getTime() < nowWeekStart.getTime()) {
    const endOfLastWeek = new Date(nowWeekStart.getTime() - 1); // last millisecond of prev week
    const dk = dateKey(endOfLastWeek);
    if (!hasReportForDate("week", dk)) {
      await generateReportForDate("week", endOfLastWeek, tasks);
    }
  }

  // ── Monthly: generate if we crossed a month boundary ──
  if (last.getMonth() !== now.getMonth() || last.getFullYear() !== now.getFullYear()) {
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const dk = dateKey(endOfLastMonth);
    if (!hasReportForDate("month", dk)) {
      await generateReportForDate("month", endOfLastMonth, tasks);
    }
  }

  // Schedule tonight's timer for current session
  scheduleTimer(now);
}

// ─── Schedule end-of-day timer (only works if tab stays open) ─
function scheduleTimer(now) {
  const eod = new Date(now); eod.setHours(23, 59, 0, 0);
  if (eod > now) {
    setTimeout(async () => {
      let tasks = [];
      try { tasks = await getTasksFromCloud(); } catch(e) { return; }
      const today = new Date();
      if (!hasReportForDate("day", dateKey(today))) {
        await generateReportForDate("day", today, tasks);
      }
    }, eod - now);
  }
}

async function runAutoReport(period) {
  // Only run if not already cached today
  const cached = getCachedReport(period);
  if (cached && cached.hasAI) return;

  const prev = activePeriod;
  activePeriod = period;

  let tasks = [];
  try { tasks = await getTasksFromCloud(); } catch(e) { activePeriod = prev; return; }

  const { statsHtml, meta } = buildStats(tasks);
  window._reportMeta = meta;
  const prompt = buildPrompt(meta);

  try {
    const aiText = await askGemini(prompt, 800);
    const aiSection = `<div class="report-ai-card" id="reportAiCard">
      <div class="report-ai-header"><span class="report-ai-title-text">✦ AI Insights — Auto Generated</span></div>
      <div class="report-ai-body" id="reportAiBody">${formatAI(aiText)}</div>
    </div>`;
    const fullHtml = statsHtml + aiSection;
    setCachedReport(period, { html: fullHtml, generatedAt: Date.now(), hasAI: true, isAuto: true });

    // If user is on this tab, show it
    if (activePeriod === period) {
      const container = document.getElementById("reportContent");
      if (container) {
        container.innerHTML = fullHtml;
        const notice = document.getElementById("reportAutoNotice");
        if (notice) {
          notice.style.display = "block";
          const el = document.getElementById("reportAutoTime");
          if (el) el.textContent = period + " report · " + new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
        }
      }
    }
  } catch(e) {
    // Silent fail for auto — stats already cached
    setCachedReport(period, { html: statsHtml, generatedAt: Date.now(), hasAI: false });
  }
  activePeriod = prev;
}

function formatAI(text) {
  return text.replace(
    /^(WINS|WATCH OUT|NEXT STEPS|STRENGTHS|WEAKNESSES|OPPORTUNITIES|THREATS)\s*$/gm,
    '<strong style="color:var(--accent);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;display:block;margin:14px 0 5px">$1</strong>'
  );
}

// ─── Cache helpers ────────────────────────────────────────────
function getCachedReport(period) {
  try {
    const key = `aurora_report_${period}_${todayKey()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedReport(period, data) {
  try {
    localStorage.setItem(`aurora_report_${period}_${todayKey()}`, JSON.stringify(data));
  } catch {}
}

function showCachedReport(cached) {
  const notice = document.getElementById("reportAutoNotice");
  if (notice && cached.isAuto) {
    notice.style.display = "block";
    const el = document.getElementById("reportAutoTime");
    if (el) el.textContent = "auto · " + new Date(cached.generatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  }
  const container = document.getElementById("reportContent");
  if (container && cached.html) container.innerHTML = cached.html;
  const aiBtn  = document.getElementById("reportAiBtn");
  const expBtn = document.getElementById("reportExportBtn");
  if (aiBtn)  aiBtn.style.display  = cached.hasAI ? "none" : "inline-flex";
  if (expBtn) expBtn.style.display = "inline-flex";
}

function todayKey() {
  return dateKey(new Date()); // consistent YYYYMMDD format
}

// ─── Past Reports history view ────────────────────────────────
let historyFilter = "all"; // current filter tab

function getAllStoredReports() {
  const reports = [];
  const periodLabels = { day:"Daily", week:"Weekly", month:"Monthly", swot:"SWOT" };
  const periodIcons  = { day:"📅", week:"📆", month:"🗓", swot:"⚡" };

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("aurora_report_")) continue;
    const parts = key.replace("aurora_report_", "").split("_");
    if (parts.length < 2) continue;
    const period  = parts[0];
    const dk      = parts[1]; // YYYYMMDD or YYYY-M-D (legacy)
    try {
      const raw  = localStorage.getItem(key);
      const data = JSON.parse(raw);
      if (!data || !data.html) continue;

      // Parse both YYYYMMDD (new) and YYYY-M-D (old) formats
      let date;
      if (dk.includes("-")) {
        const [yr, mo, dy] = dk.split("-").map(Number);
        date = new Date(yr, mo, dy); // old format had month already 0-based bug, keep as-is
      } else {
        const yr = parseInt(dk.slice(0,4));
        const mo = parseInt(dk.slice(4,6)) - 1; // 0-based
        const dy = parseInt(dk.slice(6,8));
        date = new Date(yr, mo, dy);
      }

      reports.push({
        key, period, date, data,
        label: periodLabels[period] || period,
        icon:  periodIcons[period]  || "📋"
      });
    } catch {}
  }

  reports.sort((a, b) => b.date - a.date);
  return reports;
}

function renderPastReports() {
  const container = document.getElementById("reportContent");
  if (!container) return;

  const allReports = getAllStoredReports();

  if (allReports.length === 0) {
    container.innerHTML = `
      <div class="report-empty">
        <div style="font-size:44px;margin-bottom:12px">🗂</div>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px">No past reports yet</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.7">
          Reports are auto-generated at end of each day, week and month.<br>
          You can also generate them manually from Today / Week / Month tabs.
        </div>
      </div>`;
    return;
  }

  const periodOrder  = ["day", "week", "month", "swot"];
  const periodTitles = { day:"Daily Reports", week:"Weekly Reports", month:"Monthly Reports", swot:"SWOT Reports" };
  const periodIcons  = { day:"📅", week:"📆", month:"🗓", swot:"⚡" };

  // Count per period for filter badges
  const counts = { all: allReports.length };
  periodOrder.forEach(p => { counts[p] = allReports.filter(r => r.period === p).length; });

  // Filter tabs HTML
  const filterTabs = `
    <div class="report-hist-filters" id="reportHistFilters">
      ${[{id:"all",icon:"🗂",label:"All"}, {id:"day",icon:"📅",label:"Daily"}, {id:"week",icon:"📆",label:"Weekly"}, {id:"month",icon:"🗓",label:"Monthly"}, {id:"swot",icon:"⚡",label:"SWOT"}]
        .filter(f => counts[f.id] > 0)
        .map(f => `<button class="report-hist-filter-btn${historyFilter===f.id?" active":""}" data-filter="${f.id}">
          ${f.icon} ${f.label} <span class="report-hist-filter-count">${counts[f.id]}</span>
        </button>`).join("")}
    </div>`;

  // Filter reports
  const reports = historyFilter === "all" ? allReports : allReports.filter(r => r.period === historyFilter);

  // Group by period (respects filter)
  const groups = {};
  reports.forEach(r => {
    if (!groups[r.period]) groups[r.period] = [];
    groups[r.period].push(r);
  });

  let listHtml = "";
  (historyFilter === "all" ? periodOrder : [historyFilter]).forEach(period => {
    if (!groups[period]) return;
    listHtml += `<div class="report-history-group">
      <div class="report-history-group-title">${periodIcons[period]} ${periodTitles[period]||period} <span style="opacity:0.4;font-weight:400;font-size:12px">(${groups[period].length})</span></div>`;
    groups[period].forEach(r => {
      const dateStr = r.date.toLocaleDateString("en-US", { weekday:"short", year:"numeric", month:"short", day:"numeric" });
      const timeStr = r.data.generatedAt ? new Date(r.data.generatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "";
      const hasAI   = r.data.hasAI ? '<span class="report-hist-badge">✦ AI</span>' : "";
      const isAuto  = r.data.isAuto ? '<span class="report-hist-badge report-hist-auto">auto</span>' : "";
      listHtml += `
        <div class="report-history-item" data-hkey="${r.key}">
          <div class="report-hist-info">
            <div class="report-hist-title">${r.label} Report — ${dateStr}</div>
            <div class="report-hist-meta">${timeStr} ${hasAI} ${isAuto}</div>
          </div>
          <div class="report-hist-actions">
            <button class="report-hist-view-btn" data-hkey="${r.key}">View</button>
            <button class="report-hist-export-btn" data-hkey="${r.key}" data-period="${r.period}" data-date="${dateStr}">⬇</button>
            <button class="report-hist-del-btn" data-hkey="${r.key}" title="Delete">✕</button>
          </div>
        </div>`;
    });
    listHtml += `</div>`;
  });

  container.innerHTML = filterTabs + listHtml;

  // Wire filter tabs
  container.querySelectorAll(".report-hist-filter-btn").forEach(btn => {
    btn.onclick = () => {
      historyFilter = btn.dataset.filter;
      renderPastReports(); // re-render with new filter
    };
  });

  // Wire up buttons
  container.querySelectorAll(".report-hist-view-btn").forEach(btn => {
    btn.onclick = () => {
      const key  = btn.dataset.hkey;
      const raw  = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      // Show in a modal overlay
      showHistoryModal(data, btn.closest(".report-history-item").querySelector(".report-hist-title").textContent);
    };
  });

  container.querySelectorAll(".report-hist-export-btn").forEach(btn => {
    btn.onclick = () => {
      const key    = btn.dataset.hkey;
      const period = btn.dataset.period;
      const date   = btn.dataset.date;
      const raw    = localStorage.getItem(key);
      if (!raw) return;
      const data   = JSON.parse(raw);
      exportFromHtml(data.html, period, date);
    };
  });

  container.querySelectorAll(".report-hist-del-btn").forEach(btn => {
    btn.onclick = () => {
      if (!confirm("Delete this report?")) return;
      localStorage.removeItem(btn.dataset.hkey);
      btn.closest(".report-history-item").remove();
      // If group is now empty, remove it
      const group = btn.closest(".report-history-group");
      if (group && !group.querySelector(".report-history-item")) group.remove();
    };
  });
}

function showHistoryModal(data, title) {
  // Remove existing modal
  document.getElementById("reportHistModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "reportHistModal";
  modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px";
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:20px;padding:28px;max-width:680px;width:100%;max-height:80vh;overflow-y:auto;position:relative;box-shadow:0 24px 80px rgba(0,0,0,0.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:15px;font-weight:700;color:var(--text)">${title}</div>
        <button id="histModalClose" style="background:transparent;border:none;font-size:22px;cursor:pointer;color:var(--muted);line-height:1">&times;</button>
      </div>
      <div class="report-history-content">${data.html || "<p>No content</p>"}</div>
    </div>`;
  document.body.appendChild(modal);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.getElementById("histModalClose").onclick = () => modal.remove();
}

function exportFromHtml(html, period, dateStr) {
  const periodLabels = { day:"Daily", week:"Weekly", month:"Monthly", swot:"SWOT" };
  const label = periodLabels[period] || period;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const parts = ["AURORA PLANNER — " + label.toUpperCase() + " REPORT", dateStr, "=".repeat(50), ""];
  tmp.querySelectorAll(".report-card, .report-ai-card").forEach(card => {
    const title = card.querySelector(".report-section-title, .report-ai-title-text");
    const body  = card.querySelector(".report-body, .report-ai-body, .report-stats-row");
    if (title) parts.push(title.textContent.trim().toUpperCase());
    if (body)  parts.push(body.innerText.trim());
    parts.push("");
  });
  const safeDate = dateStr.replace(/[^a-zA-Z0-9]/g, "-");
  const blob = new Blob([parts.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `aurora-${label.toLowerCase()}-report-${safeDate}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportReport() {
  const container = document.getElementById("reportContent");
  if (!container) return;
  const periodLabels = { day:"Daily", week:"Weekly", month:"Monthly", swot:"SWOT" };
  const label = periodLabels[activePeriod] || "AI";
  const dateStr = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  const parts = ["AURORA PLANNER \u2014 " + label.toUpperCase() + " REPORT", dateStr, "=".repeat(50), ""];
  container.querySelectorAll(".report-card, .report-ai-card").forEach(card => {
    const title = card.querySelector(".report-section-title, .report-ai-title-text");
    const body  = card.querySelector(".report-body, .report-ai-body, .report-stats-row");
    if (title) parts.push(title.textContent.trim().toUpperCase());
    if (body)  parts.push(body.innerText.trim());
    parts.push("");
  });
  const blob = new Blob([parts.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = "aurora-report-" + label.toLowerCase() + "-" + new Date().toISOString().slice(0,10) + ".txt";
  a.click();
  URL.revokeObjectURL(url);
}