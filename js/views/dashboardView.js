import { getTasksFromCloud } from "../firebase/firestoreService.js";

export async function renderDashboard() {
  return `<div class="dashboard-container" id="dashboardShell">
    <div class="dash-loading">Loading dashboard…</div>
  </div>`;
}

export async function initDashboard() {
  const tasks = await getTasksFromCloud();
  const now   = new Date();
  const shell = document.getElementById("dashboardShell");
  if (!shell) return;

  const dark   = document.body.classList.contains("dark");
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#00c87a";
  const accent2 = getComputedStyle(document.documentElement).getPropertyValue("--accent2").trim() || "#00d9f5";

  // ── Stats ──
  const todayStr  = now.toDateString();

  // Parse dueDate in LOCAL time to avoid UTC-offset bugs (e.g. IST = UTC+5:30)
  const parseDueDate = (dueDate, dueTime) => {
    if (!dueDate) return null;
    const dp = dueDate.length > 10 ? dueDate.slice(0, 10) : dueDate;
    const [y, mo, d] = dp.split("-").map(Number);
    if (dueTime) { const [h, m] = dueTime.split(":").map(Number); return new Date(y, mo-1, d, h, m, 0, 0); }
    return new Date(y, mo-1, d, 23, 59, 59, 999); // end of day local
  };

  const completedAt = t => t.completedAt
    ? new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt)
    : null;

  const doneToday = tasks.filter(t => {
    const ca = completedAt(t);
    return t.completed && ca && ca.toDateString() === todayStr;
  }).length;
  const totalDone = tasks.filter(t => t.completed).length;
  const pending   = tasks.filter(t => !t.completed).length;

  // Overdue: only tasks with explicit custom deadlines that have passed
  // (mirrors tasksView isMissed logic — weekly/monthly without customDeadline don't count)
  const overdue = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    if (t.type === "daily") return false;
    if (!t.customDeadline && (t.type === "weekly" || t.type === "monthly" || t.type === "yearly")) return false;
    const dl = parseDueDate(t.dueDate, t.dueTime);
    return dl && dl < now;
  }).length;

  // This calendar week (Mon–Sun)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const weekDone = tasks.filter(t => {
    const ca = completedAt(t);
    return t.completed && ca && ca >= weekStart;
  }).length;

  // ── Streak ──
  // Streak = any day where at least one task was completed (any type)
  const calcStreak = (taskList) => {
    const now2 = new Date();
    const doneDays = new Set(taskList.filter(t => t.completed && t.completedAt)
      .map(t => new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt).toDateString()));
    let s = 0;
    for (let i = 0; i <= 365; i++) {
      const d = new Date(now2); d.setDate(now2.getDate()-i);
      if (doneDays.has(d.toDateString())) s++;
      else if (i > 0) break;
    }
    return s;
  };
  const doneDays = new Set(tasks.filter(t => t.completed && t.completedAt)
    .map(t => new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt).toDateString()));
  let streak = calcStreak(tasks);

  // Live-update streak when a task is completed from tasks page
  window.addEventListener("taskCompleted", (e) => {
    const newStreak = calcStreak(e.detail.tasks);
    const el = document.querySelector(".stat-value[data-streak]") || document.querySelector(".stat-card:nth-child(4) .stat-value");
    if (el) el.textContent = newStreak + "d";
  }, { once: false });

  // ── Last 7 days ──
  const last7 = [], last7L = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate()-i);
    last7L.push(i===0 ? "Today" : d.toLocaleDateString("en-US", {weekday:"short"}));
    last7.push(tasks.filter(t => t.completed && t.completedAt &&
      new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt).toDateString() === d.toDateString()
    ).length);
  }

  // ── Priority doughnut ──
  const pLabels = ["Low","Med","High","V.High","Crit"];
  const pColors = ["#6b7280","#f59e0b","#f97316","#ef4444","#dc2626"];
  const pCounts = [1,2,3,4,5].map(p => tasks.filter(t => !t.completed && t.priority===p).length);

  // ── Type chart ──
  const typeCounts = ["daily","weekly","monthly","yearly","custom"].map(tp =>
    tasks.filter(t => t.type===tp).length);

  // ── Top tasks ──
  const pC = {1:"#6b7280",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#dc2626"};
  const pN = {1:"Low",2:"Medium",3:"High",4:"Very High",5:"Critical"};
  const topTasks = tasks.filter(t => !t.completed)
    .sort((a,b) => (b.priority||0)-(a.priority||0)).slice(0,5);

  // ── Deadlines ──
  const deadlines = tasks.filter(t => !t.completed && t.dueDate)
    .sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate)).slice(0,5);

  function daysUntil(dueDate, dueTime) {
    const dl = parseDueDate(dueDate, dueTime);
    if (!dl) return { label: "No date", cls: "" };
    const diffDays = Math.ceil((dl - now) / 86400000);
    if (dl < now && diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, cls: "deadline-overdue" };
    if (dl.toDateString() === now.toDateString()) return { label: "Today", cls: "deadline-today" };
    if (diffDays === 1) return { label: "Tomorrow", cls: "" };
    return { label: `${diffDays} days`, cls: "" };
  }

  // ── Weekly ring ──
  const wt   = tasks.filter(t => t.type==="weekly");
  const wPct = wt.length ? Math.round((wt.filter(t=>t.completed).length / wt.length)*100) : 0;
  const circ = (2*Math.PI*32).toFixed(1);

  // ── Build HTML ──
  shell.innerHTML = `
  <!-- ══ 5 STAT CARDS ══ -->
  <section class="dash-stats">
    <div class="stat-card">
      <h4>Done Today</h4>
      <div class="stat-value">${doneToday}</div>
    </div>
    <div class="stat-card">
      <h4>This Week</h4>
      <div class="stat-value">${weekDone}</div>
    </div>
    <div class="stat-card${pending>0?" stat-active":""}">
      <h4>Pending</h4>
      <div class="stat-value" style="color:${dark?"#94a3b8":"#374151"}">${pending}</div>
    </div>
    <div class="stat-card${overdue>0?" stat-warn":""}">
      <h4>Overdue</h4>
      <div class="stat-value" style="${overdue>0?"color:#ef4444":""}">${overdue}</div>
    </div>
    <div class="stat-card">
      <h4>🔥 Streak</h4>
      <div class="stat-value" style="color:#f97316">${streak}d</div>
    </div>
  </section>

  <!-- ══ 2 CHART CARDS ══ -->
  <section class="dash-charts">
    <div class="chart-card">
      <h3 class="card-title">Completions — Last 7 Days</h3>
      <canvas id="dashCompChart"></canvas>
    </div>
    <div class="chart-card">
      <h3 class="card-title">Priority Distribution</h3>
      <canvas id="dashPriChart"></canvas>
    </div>
  </section>

  <!-- ══ TOP TASKS + DEADLINES ══ -->
  <section class="dash-two-col">
    <div class="chart-card">
      <h3 class="card-title">🎯 Top Priority Tasks</h3>
      ${topTasks.length
        ? topTasks.map(t => `
          <div class="dash-task-item">
            <div class="dash-task-dot" style="background:${pC[t.priority]||"#6b7280"}"></div>
            <div class="dash-task-info">
              <div class="dash-task-title">${t.title}</div>
              <div class="dash-task-meta">${t.type} · ${pN[t.priority]||""}</div>
            </div>
          </div>`).join("")
        : `<p class="dash-empty">All clear ✨</p>`}
    </div>
    <div class="chart-card">
      <h3 class="card-title">📅 Upcoming Deadlines</h3>
      ${deadlines.length
        ? `<ul class="deadline-list">${deadlines.map(t => {
            const {label,cls} = daysUntil(t.dueDate, t.dueTime);
            return `<li class="deadline-item">
              <span class="deadline-name">${t.title}</span>
              <span class="deadline-when ${cls}">${label}</span>
            </li>`;
          }).join("")}</ul>`
        : `<p class="dash-empty">No upcoming deadlines ✨</p>`}
    </div>
  </section>

  <!-- ══ BOTTOM ROW: ring + totals + type mini chart ══ -->
  <section class="dash-bottom">
    <div class="stat-card">
      <h4>Weekly</h4>
      <div class="dash-ring-wrap">
        <svg class="dash-ring-svg" viewBox="0 0 80 80">
          <circle class="dash-ring-bg"   cx="40" cy="40" r="32"/>
          <circle class="dash-ring-fill" cx="40" cy="40" r="32"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${(2*Math.PI*32*(1-wPct/100)).toFixed(1)}"/>
        </svg>
        <div class="dash-ring-label">${wPct}%</div>
      </div>
    </div>
    <div class="stat-card">
      <h4>Total Done</h4>
      <div class="stat-value">${totalDone}</div>
    </div>
    <div class="stat-card">
      <h4>All Tasks</h4>
      <div class="stat-value">${tasks.length}</div>
    </div>
    <div class="chart-card">
      <h3 class="card-title">Task Types</h3>
      <canvas id="dashTypeChart"></canvas>
    </div>
  </section>`;

  // ── Chart.js defaults for dark/light ──
  const textColor = dark ? "#94a3b8" : "#374151";
  const gridColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const axisColor = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  function destroyOld(id) {
    const el = document.getElementById(id);
    if (el && Chart.getChart(el)) Chart.getChart(el).destroy();
    return el;
  }

  // Completions bar
  const compEl = destroyOld("dashCompChart");
  if (compEl) new Chart(compEl, {
    type: "bar",
    data: {
      labels: last7L,
      datasets: [{
        label: "Completed",
        data: last7,
        backgroundColor: last7.map((_,i) => i===6 ? accent : accent+"44"),
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false }, border: { color: axisColor } },
        y: { beginAtZero: true, ticks: { color: textColor, stepSize: 1, font: { size: 11 } }, grid: { color: gridColor }, border: { color: axisColor } }
      }
    }
  });

  // Priority doughnut
  const priEl = destroyOld("dashPriChart");
  const nzP = pCounts.map((c,i) => ({c,l:pLabels[i],col:pColors[i]})).filter(x => x.c > 0);
  if (priEl) new Chart(priEl, {
    type: "doughnut",
    data: {
      labels: nzP.map(x=>x.l),
      datasets: [{ data: nzP.map(x=>x.c), backgroundColor: nzP.map(x=>x.col), borderWidth: 2, borderColor: dark?"#1c2740":"#fff", hoverOffset: 10 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { position: "right", labels: { color: textColor, boxWidth: 11, padding: 10, font: { size: 11 } } } }
    }
  });

  // Task types bar (compact)
  const typeEl = destroyOld("dashTypeChart");
  if (typeEl) new Chart(typeEl, {
    type: "bar",
    data: {
      labels: ["Daily","Weekly","Monthly","Yearly","Custom"],
      datasets: [{ data: typeCounts,
        backgroundColor: [accent+"cc", accent2+"cc", "#7800ff99", "#f9731699", "#ec489999"],
        borderRadius: 6, borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: textColor, stepSize: 1, font: { size: 10 } }, grid: { color: gridColor }, border: { color: axisColor } },
        y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false }, border: { color: axisColor } }
      }
    }
  });
}