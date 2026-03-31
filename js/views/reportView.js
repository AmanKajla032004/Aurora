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

  // Schedule controlled auto-reports (no backfill, no burst)
  scheduleNextAutoReport();
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

// ─── AI narrative (separate, on-demand — manual button) ──────
async function generateAI() {
  const btn = document.getElementById("reportAiBtn");
  const container = document.getElementById("reportContent");
  if (!container) return;

  // Gate: prompt user to fill wellbeing first (for richer AI analysis)
  // Check if today's wellbeing entry exists
  try {
    const { auth } = await import("../firebase/firebaseConfig.js");
    const { db }   = await import("../firebase/firebaseConfig.js");
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      const today = new Date();
      const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      const snap = await getDoc(doc(db, "wellbeing", uid, "entries", key));
      if (!snap.exists()) {
        // Show gentle nudge — don't block, just suggest
        const nudge = document.getElementById("wbNudge");
        if (!nudge) {
          const n = document.createElement("div");
          n.id = "wbNudge";
          n.style.cssText = "background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:12px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:#f97316;display:flex;gap:10px;align-items:center";
          n.innerHTML = `<span style="font-size:18px">💙</span><span>Fill in today's <strong><a href="#" id="goWellbeing" style="color:#f97316">Wellbeing check-in</a></strong> first for a richer, more personalized AI report. <button id="skipWbGate" style="background:none;border:none;color:#f97316;cursor:pointer;text-decoration:underline;font-size:13px;padding:0">Skip and continue</button></span>`;
          container.insertBefore(n, container.firstChild);
          document.getElementById("goWellbeing")?.addEventListener("click", e => { e.preventDefault(); document.querySelector('[data-route="wellbeing"]')?.click(); });
          document.getElementById("skipWbGate")?.addEventListener("click", () => { n.remove(); generateAI(); });
          if (btn) { btn.disabled = false; btn.textContent = "✦ Ask AI"; }
          return;
        }
      }
    }
  } catch(e) { /* if wellbeing check fails, just proceed */ }

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
        /^(WINS|WATCH OUT|NEXT STEPS|STRENGTHS|WEAKNESSES|OPPORTUNITIES|THREATS|ACTION PLAN|TODAY'S WINS|BLOCKERS|MOMENTUM|TOMORROW'S FOCUS|WEEKLY PATTERN|CONSISTENCY|WHAT CHANGED|NEXT WEEK STRATEGY|MONTH OVERVIEW|TREND|GROWTH AREAS|BURNOUT RISK|NEXT MONTH PLAN)\s*$/gm,
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

// ─── Prompt builder ─────────────────────────────────────────────
function buildPrompt(meta) {
  const { completedInPeriod=[], overdue=[], pending=[], highPri=[], streak=0, rate=0, tasks=[], periodLabel="today" } = meta;
  const tLabel = t => t.title + (t.description ? " — " + t.description : "");
  const wb = meta?.wellbeing;

  // ── Shared data snapshot (structured JSON for Gemini) ──
  const dataBlock = JSON.stringify({
    period:        activePeriod,
    totalTasks:    tasks.length,
    completedAll:  tasks.filter(t => t.completed).length,
    completedNow:  completedInPeriod.length,
    completedList: completedInPeriod.slice(0, 6).map(tLabel),
    pendingCount:  pending.length,
    overdueCount:  overdue.length,
    overdueList:   overdue.slice(0, 4).map(tLabel),
    highPriority:  highPri.slice(0, 4).map(tLabel),
    completionRate: rate,
    streak:        streak,
    wellbeing:     wb ? {
      mood: wb.avgMood, energy: wb.avgEnergy,
      stress: wb.avgStress, sleep: wb.avgSleep, water: wb.avgWater
    } : null
  }, null, 0);

  // ─────────────────────────────────────────────────────────────
  // DAILY — "Daily reflection coach"
  // Tone: warm, direct, brief. Like a coach debriefing after practice.
  // Focus: only today. No big-picture analysis. Quick and tactical.
  // ─────────────────────────────────────────────────────────────
  if (activePeriod === "day") {
    return `You are a daily reflection coach — warm, sharp, and brief. You debrief someone on their day the way a coach talks to an athlete after practice: honest, specific, no fluff.

RULES:
- Plain text only. No markdown, no bullets, no dashes, no asterisks.
- Talk ONLY about today. Do not analyze trends, patterns, or long-term arcs.
- Daily and one-time tasks are what count today. Weekly/monthly/yearly goals are ongoing — give credit for progress, never frame them as failures.
- Keep the entire response under 150 words. Be punchy.
- Each section: 2 sentences max.

HERE IS TODAY'S DATA:
${dataBlock}
${wb ? `\nBody signals: mood ${wb.avgMood}/7, energy ${wb.avgEnergy}/6, stress ${wb.avgStress}/5, sleep ${wb.avgSleep}h.` : ""}

Write exactly these 4 sections. Print each heading alone on its own line in ALL CAPS, then your sentences below it:

TODAY'S WINS
Name what got done. If nothing, acknowledge showing up and note the streak.

BLOCKERS
What stalled or is overdue — name the tasks. If stress or fatigue contributed, say so plainly.

MOMENTUM
One sentence: is the streak alive, dying, or dead? State the number and what it means.

TOMORROW'S FOCUS
Pick ONE task from the overdue or high-priority list. Name it. Say why it is the move to make.`;
  }

  // ─────────────────────────────────────────────────────────────
  // WEEKLY — "Behavior pattern analyst"
  // Tone: clinical, curious, pattern-obsessed. Like a sports analyst
  //       breaking down game film. Compares, contrasts, spots habits.
  // Focus: the 7-day window. Rhythms, consistency, shifts.
  // ─────────────────────────────────────────────────────────────
  if (activePeriod === "week") {
    return `You are a behavior pattern analyst — clinical, curious, and obsessed with rhythms. You study someone's week the way a sports analyst breaks down game film: looking for patterns, streaks, drop-offs, and hidden signals in the data.

RULES:
- Plain text only. No markdown, no bullets, no dashes, no asterisks.
- Analyze the 7-day window as a unit. Compare early-week vs late-week. Note which task types got attention and which were ignored.
- Ground every claim in a number from the data. No vague praise or criticism.
- Each section: 2-3 sentences.
- Total response: roughly 200 words.

THIS WEEK'S DATA:
${dataBlock}
${wb ? `\nBiometric context: avg mood ${wb.avgMood}/7, avg energy ${wb.avgEnergy}/6, avg stress ${wb.avgStress}/5, avg sleep ${wb.avgSleep}h, hydration ${wb.avgWater} glasses/day.` : ""}

Write exactly these 4 sections. Print each heading alone on its own line in ALL CAPS:

WEEKLY PATTERN
Which task categories dominated? Were completions clustered or spread out? Did effort taper off or build through the week?

CONSISTENCY
Rate their reliability this week on a 1–10 scale and justify it. Reference the streak length, the completion rate, and whether overdue items grew or shrank.

WHAT CHANGED
Identify one concrete shift from the previous norm — a new habit forming, a priority rising, or a category slipping. Cite the numbers.

NEXT WEEK STRATEGY
Prescribe 2 specific behavioral adjustments. Name the exact tasks or categories to prioritize and one thing to stop doing or defer.${wb ? " If biometric data reveals a sleep or stress issue, tie one adjustment to that." : ""}`;
  }

  // ─────────────────────────────────────────────────────────────
  // MONTHLY — "Strategic productivity advisor"
  // Tone: executive, measured, forward-looking. Like a quarterly
  //       business review — zoomed out, focused on trajectory.
  // Focus: 30-day arc. Growth vs decline. Sustainability. Strategy.
  // ─────────────────────────────────────────────────────────────
  if (activePeriod === "month") {
    return `You are a strategic productivity advisor — measured, executive-level, forward-looking. You conduct a monthly review the way a COO reviews a quarterly report: zoomed out, focused on trajectory and sustainability, not individual tasks.

RULES:
- Plain text only. No markdown, no bullets, no dashes, no asterisks.
- Think in arcs, not events. Is output growing, plateauing, or declining? Is the system sustainable?
- When citing tasks, treat them as evidence of broader themes, not standalone items.
- Each section: 2-3 sentences.
- Total response: roughly 250 words.

THIS MONTH'S DATA:
${dataBlock}
${wb ? `\nWellbeing trend (7-day avg): mood ${wb.avgMood}/7, energy ${wb.avgEnergy}/6, stress ${wb.avgStress}/5, sleep ${wb.avgSleep}h, water ${wb.avgWater} glasses. Use this to assess sustainability.` : ""}

Write exactly these 5 sections. Print each heading alone on its own line in ALL CAPS:

MONTH OVERVIEW
Characterize the month in one sentence. Then state the core numbers: total completed, completion rate, overdue count. Was this a month of building, maintaining, or sliding?

TREND
Is productivity on an upward, flat, or downward trajectory? Compare the completion rate and overdue count against what a healthy baseline looks like. Be honest about direction.

GROWTH AREAS
Where did real capability expand? Name specific task categories or goals where follow-through was strong. Cite completion numbers as evidence.

BURNOUT RISK
Evaluate sustainability on a Low / Moderate / High / Critical scale.${wb ? " Stress at " + wb.avgStress + "/5 and sleep at " + wb.avgSleep + "h are key inputs." : ""} Factor in overdue accumulation and whether the current pace can continue for another month without breaking.

NEXT MONTH PLAN
One strategic recommendation. Should they narrow scope, attack a backlog, invest in a habit, or change their system? Name a specific measurable target for the next 30 days.`;
  }

  // ─────────────────────────────────────────────────────────────
  // SWOT — "Performance evaluator"
  // Tone: structured, clinical, categorical. Like a management
  //       consultant filling in a 2x2 matrix — no narrative, just
  //       classified findings and prescribed actions.
  // Focus: sort every signal into exactly one quadrant. Then act.
  // ─────────────────────────────────────────────────────────────
  if (activePeriod === "swot") {
    return `You are a performance evaluator conducting a structured SWOT assessment. You think in quadrants, not narratives. Your job is to classify every meaningful signal from the data into exactly one of four categories, then prescribe actions.

RULES:
- Plain text only. No markdown, no bullets, no dashes, no asterisks.
- STRICT categorical output. Every finding belongs in one quadrant — do not repeat a finding across sections.
- Internal factors (Strengths, Weaknesses) = things within the person's control: habits, completion rates, priorities, consistency.
- External factors (Opportunities, Threats) = conditions or timing that could help or hurt: deadlines approaching, workload trends, wellbeing trajectory, streak momentum.
- Be forensic. Name specific tasks, cite exact numbers. No vague observations.
- Each quadrant: exactly 2-3 findings, each one sentence.

PERFORMANCE DATA:
${dataBlock}
${wb ? `\nWellbeing indicators: mood ${wb.avgMood}/7, energy ${wb.avgEnergy}/6, stress ${wb.avgStress}/5, sleep ${wb.avgSleep}h, water ${wb.avgWater} glasses.` : ""}

Write exactly these 5 sections. Print each heading alone on its own line in ALL CAPS:

STRENGTHS
Internal positives. What habits, completion patterns, or priorities show discipline? Cite the data.

WEAKNESSES
Internal negatives. What is being neglected, deprioritized, or consistently left undone? Name the tasks and numbers.

OPPORTUNITIES
External tailwinds. What timing, momentum, or conditions make this a good moment to push forward? Reference streak state, upcoming deadlines, or energy levels.

THREATS
External headwinds. What could derail progress in the next period — overdue snowball, stress trajectory, overcommitment? Quantify the risk.

ACTION PLAN
Exactly 3 numbered directives. Each must name a specific task or metric and state a concrete action to take within 7 days. Format: "1. [action]" — one sentence each.`;
  }

  // ── FALLBACK (should not normally hit) ────────────────────────
  return "Write a productivity report based on this data. Plain text, no markdown.\n\n"
    + "DATA:\n" + dataBlock + "\n\n"
    + "Write 3 sections (WINS, WATCH OUT, NEXT STEPS), each 2-3 sentences. Be specific to the actual tasks listed.";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── CONTROLLED AUTO-REPORT SCHEDULER ─────────────────────────
// Replaces the old backfill-based scheduleAutoReports().
//
// Rules:
//   • NO backfill loops — never generates reports for missed days
//   • NO AI calls on page load — only schedules a timer
//   • ONE AI call per scheduled period (daily / weekly / monthly / yearly)
//   • localStorage flags prevent duplicate generation across reloads
//   • Manual "Ask AI" button is completely unaffected
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Flag key builders — each period gets exactly one flag per natural period
function aiDailyKey(d)   { return `aurora_ai_daily_${dateKey(d)}`; }
function aiWeeklyKey(d)  {
  // ISO week number for the key: YYYYWWW
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - jan1) / 86400000);
  const week = String(Math.ceil((days + jan1.getDay() + 1) / 7)).padStart(2, "0");
  return `aurora_ai_weekly_${d.getFullYear()}W${week}`;
}
function aiMonthlyKey(d) {
  return `aurora_ai_monthly_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}`;
}
function aiYearlyKey(d)  { return `aurora_ai_yearly_${d.getFullYear()}`; }

function hasAIFlag(key)  { try { return localStorage.getItem(key) === "1"; } catch { return false; } }
function setAIFlag(key)  { try { localStorage.setItem(key, "1"); } catch {} }

// Active timer ID so we don't stack timers on re-init
let _autoTimerId = null;

/**
 * scheduleNextAutoReport()
 * Called once on app load (from initReport). Sets a single setTimeout
 * for the next midnight (00:00:00 local). When that fires it:
 *   1. Generates the daily AI report (if flag not set)
 *   2. If Sunday → also generates weekly report
 *   3. If last day of month → also generates monthly report
 *   4. If Dec 31 → also generates yearly report
 *   5. Reschedules itself for the NEXT midnight
 */
function scheduleNextAutoReport() {
  // Clear any existing timer to prevent stacking
  if (_autoTimerId !== null) {
    clearTimeout(_autoTimerId);
    _autoTimerId = null;
  }

  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(now.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);

  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  _autoTimerId = setTimeout(async () => {
    _autoTimerId = null;
    // Enable auto-AI flag, run reports, then disable
    window.__autoAIAllowed = true;
    try {
      await runScheduledReports();
    } finally {
      window.__autoAIAllowed = false;
    }
    // Reschedule for the next midnight
    scheduleNextAutoReport();
  }, msUntilMidnight);
}

/**
 * runScheduledReports()
 * Executes at midnight. Checks which periods need a report and generates
 * exactly ONE AI call per qualifying period. Uses localStorage flags to
 * guarantee idempotency — if the app reloads and the timer re-fires for
 * the same period, no duplicate call is made.
 */
async function runScheduledReports() {
  const now = new Date();

  // The report covers the day that just ended (yesterday at 11:59 PM)
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  yesterday.setHours(23, 59, 0, 0);

  // ── Daily: always at midnight ──
  if (!hasAIFlag(aiDailyKey(yesterday))) {
    await generateAutoAIReport("day", yesterday);
    setAIFlag(aiDailyKey(yesterday));
  }

  // ── Weekly: if yesterday was Sunday (end of week) ──
  if (yesterday.getDay() === 0 && !hasAIFlag(aiWeeklyKey(yesterday))) {
    await generateAutoAIReport("week", yesterday);
    setAIFlag(aiWeeklyKey(yesterday));
  }

  // ── Monthly: if yesterday was last day of its month ──
  const nextDayOfYesterday = new Date(yesterday);
  nextDayOfYesterday.setDate(yesterday.getDate() + 1);
  if (nextDayOfYesterday.getMonth() !== yesterday.getMonth()) {
    if (!hasAIFlag(aiMonthlyKey(yesterday))) {
      await generateAutoAIReport("month", yesterday);
      setAIFlag(aiMonthlyKey(yesterday));
    }
  }

  // ── Yearly: if yesterday was Dec 31 ──
  if (yesterday.getMonth() === 11 && yesterday.getDate() === 31) {
    if (!hasAIFlag(aiYearlyKey(yesterday))) {
      await generateAutoAIReport("year", yesterday);
      setAIFlag(aiYearlyKey(yesterday));
    }
  }
}

/**
 * generateAutoAIReport(period, forDate)
 * Fetches tasks, builds stats for the given period/date, calls askGemini
 * ONCE, and stores the result. This is the ONLY function that makes an
 * AI call during auto-generation.
 */
async function generateAutoAIReport(period, forDate) {
  // Guard: only allow auto AI calls when explicitly enabled by the scheduler
  if (!window.__autoAIAllowed) return;

  let tasks = [];
  try { tasks = await getTasksFromCloud(); } catch(e) { return; }

  const wellbeing = await getWellbeingForReport(7).catch(() => null);

  // Temporarily set activePeriod for buildStats/buildPrompt
  const savedPeriod = activePeriod;
  activePeriod = period === "year" ? "month" : period; // yearly uses month-scope stats
  const { statsHtml, meta } = buildStats(tasks, forDate);
  meta.wellbeing = wellbeing;

  const prompt = buildPrompt(meta);
  activePeriod = savedPeriod; // restore immediately

  try {
    const aiText = await askGemini(prompt, 800);
    const periodLabels = { day:"Daily", week:"Weekly", month:"Monthly", year:"Yearly" };
    const aiSection = `<div class="report-ai-card">
      <div class="report-ai-header">
        <span class="report-ai-title-text">✦ ${periodLabels[period] || period} Report — ${forDate.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
      </div>
      <div class="report-ai-body">${formatAI(aiText)}</div>
    </div>`;
    const fullHtml = statsHtml + aiSection;
    saveReportForDate(period === "year" ? "month" : period, dateKey(forDate), fullHtml, true);

    // If user is currently viewing this tab, update the UI
    if (activePeriod === period || (period === "year" && activePeriod === "month")) {
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
    // On AI failure, save stats-only — no retry to avoid extra API calls
    saveReportForDate(period === "year" ? "month" : period, dateKey(forDate), statsHtml, false);
  }
}

// Legacy export — now a no-op; the old backfill logic is removed
export async function checkAndGenerateMissedReports() {
  // Intentionally empty — auto reports are handled by scheduleNextAutoReport()
  // which is called from initReport(). No backfill, no burst generation.
}

function formatAI(text) {
  return text.replace(
    /^(WINS|WATCH OUT|NEXT STEPS|STRENGTHS|WEAKNESSES|OPPORTUNITIES|THREATS|ACTION PLAN|TODAY'S WINS|BLOCKERS|MOMENTUM|TOMORROW'S FOCUS|WEEKLY PATTERN|CONSISTENCY|WHAT CHANGED|NEXT WEEK STRATEGY|MONTH OVERVIEW|TREND|GROWTH AREAS|BURNOUT RISK|NEXT MONTH PLAN)\s*$/gm,
    '<strong style="color:var(--accent);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;display:block;margin:14px 0 5px">$1</strong>'
  );
}

// ─── Helper: local date key "YYYYMMDD" ───────────────────────
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}${m}${day}`;
}

// ─── Save a report for a specific date ───────────────────────
function saveReportForDate(period, dateStr, htmlContent, hasAI) {
  try {
    localStorage.setItem(`aurora_report_${period}_${dateStr}`,
      JSON.stringify({ html: htmlContent, generatedAt: Date.now(), hasAI: !!hasAI, isAuto: true }));
  } catch(e) {}
}

// ─── Check if a report exists for a given date key ───────────
function hasReportForDate(period, dateStr) {
  try { return !!localStorage.getItem(`aurora_report_${period}_${dateStr}`); }
  catch(e) { return false; }
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