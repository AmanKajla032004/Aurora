import { getTasksFromCloud } from "../firebase/firestoreService.js";
import { auth } from "../firebase/firebaseConfig.js";

export async function renderDashboard() {
  return `<div class="dv-root" id="dashboardShell">
    <div class="dv-loading">
      <div class="dv-spinner"></div>
      <span>Loading overview…</span>
    </div>
  </div>`;
}

export async function initDashboard() {
  const shell = document.getElementById("dashboardShell");
  if (!shell) return;

  const tasks  = await getTasksFromCloud();
  const now    = new Date();
  const dark   = document.body.classList.contains("dark");
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#00c87a";
  const accent2= getComputedStyle(document.documentElement).getPropertyValue("--accent2").trim() || "#00d9f5";
  const userName = auth.currentUser?.email?.split("@")[0] || "there";

  // ── Helpers ──────────────────────────────────────────────
  const caDate = t => t.completedAt
    ? new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt)
    : null;

  const parseLocal = (dueDate, dueTime) => {
    if (!dueDate) return null;
    const dp = (dueDate.length > 10 ? dueDate.slice(0,10) : dueDate);
    const [y,mo,d] = dp.split("-").map(Number);
    if (dueTime) { const [h,m] = dueTime.split(":").map(Number); return new Date(y,mo-1,d,h,m,0,0); }
    return new Date(y,mo-1,d,23,59,59,999);
  };

  const todayStr = now.toDateString();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay()+6)%7));
  weekStart.setHours(0,0,0,0);

  // ── Stats ────────────────────────────────────────────────
  const doneToday = tasks.filter(t => { const c=caDate(t); return t.completed && c && c.toDateString()===todayStr; }).length;
  const weekDone  = tasks.filter(t => { const c=caDate(t); return t.completed && c && c>=weekStart; }).length;
  const pending   = tasks.filter(t => !t.completed).length;
  const totalDone = tasks.filter(t => t.completed).length;
  const overdue   = tasks.filter(t => {
    if (t.completed||!t.dueDate) return false;
    if (t.type==="daily") return false;
    if (!t.customDeadline && (t.type==="weekly"||t.type==="monthly"||t.type==="yearly")) return false;
    const dl=parseLocal(t.dueDate,t.dueTime); return dl&&dl<now;
  }).length;

  // ── Streak ───────────────────────────────────────────────
  const doneDaySet = new Set(tasks.filter(t=>t.completed&&t.completedAt).map(t=>caDate(t).toDateString()));
  let streak = 0;
  for (let i=0;i<=365;i++) {
    const d=new Date(now); d.setDate(now.getDate()-i);
    if (doneDaySet.has(d.toDateString())) streak++;
    else if (i>0) break;
  }

  // ── Today's progress ─────────────────────────────────────
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const todayTasks = [...new Map(tasks.filter(t => {
    if (t.type==="daily") return true;
    if (t.completed && caDate(t)?.toDateString()===todayStr) return true;
    if (t.dueDate && t.dueDate.slice(0,10)<=todayDateStr) return true;
    return false;
  }).map(t=>[t.id,t])).values()];
  const todayDone = todayTasks.filter(t=>t.completed).length;
  const todayPct  = todayTasks.length ? Math.round((todayDone/todayTasks.length)*100) : 0;

  // ── Last 7 days ──────────────────────────────────────────
  const last7=[], last7L=[];
  for (let i=6;i>=0;i--) {
    const d=new Date(now); d.setDate(now.getDate()-i);
    last7L.push(i===0?"Today":d.toLocaleDateString("en-US",{weekday:"short"}));
    last7.push(tasks.filter(t=>t.completed&&t.completedAt&&caDate(t).toDateString()===d.toDateString()).length);
  }
  const maxBar = Math.max(...last7, 1);

  // ── Priority distribution ────────────────────────────────
  const pColors={1:"#6b7280",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#dc2626"};
  const pLabels={1:"Low",2:"Med",3:"High",4:"V.High",5:"Crit"};
  const pCounts=[1,2,3,4,5].map(p=>tasks.filter(t=>!t.completed&&t.priority===p).length);
  const pTotal = pCounts.reduce((a,b)=>a+b,0)||1;

  // ── Top tasks (with deadline-escalated display priority) ─
  const displayPri = t => {
    let dp = t.priority||3;
    if (!t.completed && t.dueDate) {
      const dl=parseLocal(t.dueDate,t.dueTime);
      if (dl) {
        const days=(dl-now)/86400000;
        if (days<=1&&dp<5) dp=5;
        else if (days<=3&&dp<4) dp=4;
        else if (days<=7&&dp<3) dp=3;
      }
    }
    return dp;
  };
  const topTasks = tasks.filter(t=>!t.completed)
    .sort((a,b)=>displayPri(b)-displayPri(a)).slice(0,6);

  // ── Upcoming deadlines ───────────────────────────────────
  const upcoming = tasks.filter(t=>!t.completed&&t.dueDate)
    .map(t=>({...t, _dl:parseLocal(t.dueDate,t.dueTime)}))
    .filter(t=>t._dl)
    .sort((a,b)=>a._dl-b._dl).slice(0,5);

  const daysLabel = dl => {
    const diff=Math.round((dl-now)/86400000);
    if (dl<now) return {txt:`${Math.abs(diff)}d overdue`,urgent:2};
    if (dl.toDateString()===todayStr) return {txt:"Today",urgent:2};
    if (diff===1) return {txt:"Tomorrow",urgent:1};
    if (diff<=3)  return {txt:`${diff} days`,urgent:1};
    return {txt:`${diff} days`,urgent:0};
  };

  // ── Task type breakdown ───────────────────────────────────
  const types=["daily","weekly","monthly","yearly","once","custom"];
  const typeIcons={"daily":"🔄","weekly":"📅","monthly":"🗓","yearly":"🎯","once":"✅","custom":"⚙️"};
  const typeCounts=types.map(tp=>tasks.filter(t=>t.type===tp).length);

  // ── Build HTML ───────────────────────────────────────────
  const circ = (2*Math.PI*28).toFixed(1);
  const offset = (2*Math.PI*28*(1-todayPct/100)).toFixed(1);

  shell.innerHTML = `
<div class="dv-header">
  <div class="dv-header-left">
    <h1 class="dv-title">Overview</h1>
    <p class="dv-subtitle">${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p>
  </div>
  <div class="dv-progress-ring" title="${todayPct}% of today's tasks done">
    <svg viewBox="0 0 64 64" class="dv-ring-svg">
      <circle cx="32" cy="32" r="28" class="dv-ring-bg"/>
      <circle cx="32" cy="32" r="28" class="dv-ring-fg"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        style="stroke:${accent}"/>
    </svg>
    <div class="dv-ring-inner">
      <span class="dv-ring-pct">${todayPct}%</span>
      <span class="dv-ring-lbl">today</span>
    </div>
  </div>
</div>

<!-- ══ STAT PILLS ══ -->
<div class="dv-stats">
  <div class="dv-stat">
    <div class="dv-stat-icon" style="background:${accent}22;color:${accent}">✓</div>
    <div class="dv-stat-body">
      <div class="dv-stat-num">${doneToday}</div>
      <div class="dv-stat-lbl">Done Today</div>
    </div>
  </div>
  <div class="dv-stat">
    <div class="dv-stat-icon" style="background:#818cf822;color:#818cf8">📆</div>
    <div class="dv-stat-body">
      <div class="dv-stat-num">${weekDone}</div>
      <div class="dv-stat-lbl">This Week</div>
    </div>
  </div>
  <div class="dv-stat ${pending>0?"dv-stat-warn":""}">
    <div class="dv-stat-icon" style="background:#f59e0b22;color:#f59e0b">⏳</div>
    <div class="dv-stat-body">
      <div class="dv-stat-num">${pending}</div>
      <div class="dv-stat-lbl">Pending</div>
    </div>
  </div>
  <div class="dv-stat ${overdue>0?"dv-stat-alert":""}">
    <div class="dv-stat-icon" style="background:#ef444422;color:#ef4444">⚠</div>
    <div class="dv-stat-body">
      <div class="dv-stat-num" style="${overdue>0?"color:#ef4444":""}">${overdue}</div>
      <div class="dv-stat-lbl">Overdue</div>
    </div>
  </div>
  <div class="dv-stat">
    <div class="dv-stat-icon" style="background:#f9731622;color:#f97316">🔥</div>
    <div class="dv-stat-body">
      <div class="dv-stat-num" style="color:#f97316">${streak}</div>
      <div class="dv-stat-lbl">Day Streak</div>
    </div>
  </div>
  <div class="dv-stat">
    <div class="dv-stat-icon" style="background:${accent}22;color:${accent}">★</div>
    <div class="dv-stat-body">
      <div class="dv-stat-num">${totalDone}</div>
      <div class="dv-stat-lbl">All Time</div>
    </div>
  </div>
</div>

<!-- ══ MAIN GRID ══ -->
<div class="dv-grid">

  <!-- Activity chart -->
  <div class="dv-card dv-card-wide">
    <div class="dv-card-head">
      <span class="dv-card-title">Activity — Last 7 Days</span>
      <span class="dv-card-sub">${last7.reduce((a,b)=>a+b,0)} completions</span>
    </div>
    <div class="dv-bar-chart">
      ${last7.map((v,i)=>`
        <div class="dv-bar-col">
          <div class="dv-bar-wrap">
            <div class="dv-bar-fill ${i===6?"dv-bar-today":""}"
              style="height:${Math.round((v/maxBar)*100)}%;background:${i===6?accent:accent+"55"}">
              ${v>0?`<span class="dv-bar-tip">${v}</span>`:""}
            </div>
          </div>
          <span class="dv-bar-lbl">${last7L[i]}</span>
        </div>`).join("")}
    </div>
  </div>

  <!-- Top priority tasks -->
  <div class="dv-card">
    <div class="dv-card-head">
      <span class="dv-card-title">🎯 Priority Tasks</span>
      <span class="dv-card-sub">${pending} pending</span>
    </div>
    <div class="dv-task-list">
      ${topTasks.length ? topTasks.map(t => {
        const dp=displayPri(t); const col=pColors[dp]||"#6b7280";
        return `<div class="dv-task-row">
          <div class="dv-task-stripe" style="background:${col}"></div>
          <div class="dv-task-info">
            <div class="dv-task-name">${t.title}</div>
            <div class="dv-task-meta">${t.type}${t.dueDate?` · ${t.dueDate.slice(5)}`:""}</div>
          </div>
          <span class="dv-task-badge" style="background:${col}22;color:${col}">${pLabels[dp]||""}</span>
        </div>`;
      }).join("") : `<div class="dv-empty">All tasks complete ✨</div>`}
    </div>
  </div>

  <!-- Upcoming deadlines -->
  <div class="dv-card">
    <div class="dv-card-head">
      <span class="dv-card-title">📅 Deadlines</span>
    </div>
    <div class="dv-deadline-list">
      ${upcoming.length ? upcoming.map(t => {
        const {txt,urgent}=daysLabel(t._dl);
        const urgCls=urgent===2?"dv-dl-red":urgent===1?"dv-dl-amber":"";
        return `<div class="dv-dl-row">
          <div class="dv-dl-dot ${urgCls}"></div>
          <div class="dv-dl-info">
            <span class="dv-dl-name">${t.title}</span>
            <span class="dv-dl-type">${t.type}</span>
          </div>
          <span class="dv-dl-when ${urgCls}">${txt}</span>
        </div>`;
      }).join("") : `<div class="dv-empty">No upcoming deadlines ✨</div>`}
    </div>
  </div>

  <!-- Priority distribution -->
  <div class="dv-card">
    <div class="dv-card-head">
      <span class="dv-card-title">Priority Split</span>
      <span class="dv-card-sub">${pending} active</span>
    </div>
    <div class="dv-pri-bars">
      ${[1,2,3,4,5].map(p=>{
        const pct=Math.round((pCounts[p-1]/pTotal)*100);
        return `<div class="dv-pri-row">
          <span class="dv-pri-lbl">${pLabels[p]}</span>
          <div class="dv-pri-track">
            <div class="dv-pri-fill" style="width:${pct}%;background:${pColors[p]}"></div>
          </div>
          <span class="dv-pri-num">${pCounts[p-1]}</span>
        </div>`;
      }).join("")}
    </div>
    <canvas id="dashPriChart" style="display:none"></canvas>
  </div>

  <!-- Task types -->
  <div class="dv-card dv-card-types">
    <div class="dv-card-head">
      <span class="dv-card-title">Task Types</span>
    </div>
    <div class="dv-types-grid">
      ${types.map((tp,i)=>`
        <div class="dv-type-pill">
          <span class="dv-type-icon">${typeIcons[tp]}</span>
          <span class="dv-type-count">${typeCounts[i]}</span>
          <span class="dv-type-name">${tp}</span>
        </div>`).join("")}
    </div>
  </div>

</div>`;

  // Still render Chart.js for the doughnut (hidden canvas, used if needed)
  const textColor = dark ? "#94a3b8" : "#374151";
  function destroyOld(id) {
    const el = document.getElementById(id);
    if (el && window.Chart && Chart.getChart(el)) Chart.getChart(el).destroy();
    return el;
  }
  // Completions bar via Chart.js (optional canvas backup — we use custom bars above)
  // Priority doughnut kept for future use
  const priEl = destroyOld("dashPriChart");
  const nzP = pCounts.map((c,i)=>({c,l:pLabels[i+1],col:pColors[i+1]})).filter(x=>x.c>0);
  if (priEl && window.Chart && nzP.length) {
    new Chart(priEl, {
      type:"doughnut",
      data:{ labels:nzP.map(x=>x.l), datasets:[{data:nzP.map(x=>x.c),backgroundColor:nzP.map(x=>x.col),borderWidth:2,borderColor:dark?"#1c2740":"#fff",hoverOffset:8}]},
      options:{ responsive:true, maintainAspectRatio:false, cutout:"68%", plugins:{legend:{position:"right",labels:{color:textColor,boxWidth:10,padding:8,font:{size:10}}}}  }
    });
  }
}