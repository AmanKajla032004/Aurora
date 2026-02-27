import { getTasksFromCloud } from "../firebase/firestoreService.js";
import { auth } from "../firebase/firebaseConfig.js";

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Do the hard jobs first. The easy jobs will take care of themselves.", author: "Dale Carnegie" },
  { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
  { text: "Small steps every day lead to giant leaps over time.", author: "Aurora" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "The distance between dreams and reality is called action.", author: "Aurora" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getTodayString() {
  return new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
}

export function renderHome() {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const userName = auth.currentUser?.email?.split("@")[0] || "there";
  return `
    <div class="home-container" id="homeShell">
      <div class="home-loading-overlay" id="homeLoader">
        <div class="home-loader-dot"></div>
      </div>

      <!-- HERO -->
      <div class="home-hero">
        <div class="home-hero-left">
          <p class="home-date">${getTodayString()}</p>
          <h1 class="home-greeting">${getGreeting()}, <span class="home-name">${userName}</span></h1>
          <blockquote class="home-quote">
            <span class="home-quote-mark">"</span>${quote.text}<span class="home-quote-mark">"</span>
            <footer class="home-quote-author">— ${quote.author}</footer>
          </blockquote>
        </div>
        <div class="home-hero-right" id="homeRing">
          <!-- progress ring injected by JS -->
        </div>
      </div>

      <!-- QUICK STATS ROW -->
      <div class="home-stats-row" id="homeStats">
        <div class="home-stat-pill skeleton"></div>
        <div class="home-stat-pill skeleton"></div>
        <div class="home-stat-pill skeleton"></div>
        <div class="home-stat-pill skeleton"></div>
      </div>

      <!-- TWO COLUMN -->
      <div class="home-two-col">
        <!-- TODAY'S FOCUS -->
        <div class="home-card" id="homeFocus">
          <div class="home-card-header">
            <span class="home-card-icon">🎯</span>
            <h3>Today's Focus</h3>
          </div>
          <div class="home-card-body skeleton-block"></div>
        </div>

        <!-- UPCOMING -->
        <div class="home-card" id="homeUpcoming">
          <div class="home-card-header">
            <span class="home-card-icon">⏰</span>
            <h3>Coming Up</h3>
          </div>
          <div class="home-card-body skeleton-block"></div>
        </div>
      </div>

      <!-- STREAK + MOTIVATION -->
      <div class="home-bottom-row" id="homeBottom">
        <div class="home-card home-streak-card">
          <div class="home-card-header">
            <span class="home-card-icon">🔥</span>
            <h3>Daily Streak</h3>
          </div>
          <div class="home-card-body skeleton-block"></div>
        </div>
        <div class="home-card home-quick-card">
          <div class="home-card-header">
            <span class="home-card-icon">⚡</span>
            <h3>Quick Actions</h3>
          </div>
          <div class="home-quick-actions">
            <button class="home-quick-btn" data-route="tasks">+ Add Task</button>
            <button class="home-quick-btn" data-route="brainstorm">💡 Brainstorm</button>
            <button class="home-quick-btn" data-route="whisper">🌊 Whisper</button>
            <button class="home-quick-btn" data-route="analytics">📊 Analytics</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function initHome() {
  const tasks = await getTasksFromCloud();
  const now   = new Date();

  // Stats
  const todayStr   = now.toDateString();
  const doneToday  = tasks.filter(t => {
    if (!t.completed || !t.completedAt) return false;
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    return d.toDateString() === todayStr;
  }).length;
  const pending    = tasks.filter(t => !t.completed).length;
  // Match tasksView isMissed logic exactly
  const buildDeadlineH = (dueDate, dueTime) => {
    if (!dueDate) return null;
    const dp = dueDate.length > 10 ? dueDate.slice(0,10) : dueDate;
    const [y, mo, d] = dp.split("-").map(Number);
    if (dueTime) { const [h, m] = dueTime.split(":").map(Number); return new Date(y, mo-1, d, h, m, 0, 0); }
    return new Date(y, mo-1, d, 23, 59, 59, 999);
  };
  const overdue = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    if (t.type === "daily") return false;
    if (!t.customDeadline && (t.type === "weekly" || t.type === "monthly" || t.type === "yearly")) return false;
    const dl = buildDeadlineH(t.dueDate, t.dueTime);
    return dl && dl < now;
  }).length;
  const totalDone  = tasks.filter(t => t.completed).length;

  // Streak
  // Streak: any day with ANY completed task counts
  const days = new Set(tasks.filter(t => t.completed && t.completedAt).map(t => {
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    return d.toDateString();
  }));
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now); d.setDate(now.getDate()-i);
    if (days.has(d.toDateString())) streak++;
    else if (i > 0) break;
  }

  // Today's progress ring: daily tasks + anything due on or before today
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const todayTasks = tasks.filter(t => {
    if (t.completed && t.completedAt) {
      // include completed tasks that were done today
      const cd = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
      if (cd.toDateString() === now.toDateString()) return true;
    }
    if (t.type === "daily") return true;
    if (!t.dueDate) return false;
    const dd = t.dueDate.slice(0, 10);
    return dd <= todayDateStr; // due today or overdue
  });
  // Deduplicate by id
  const todayTasksUniq = [...new Map(todayTasks.map(t => [t.id, t])).values()];
  const todayDone = todayTasksUniq.filter(t => t.completed).length;
  const pct = todayTasksUniq.length ? Math.round((todayDone / todayTasksUniq.length) * 100) : 0;

  // Focus tasks
  const focus = tasks.filter(t => !t.completed).sort((a,b)=>(b.priority||0)-(a.priority||0)).slice(0,4);

  // Parse due date in local time (avoid UTC offset issues)
  const parseLocal = (dueDate) => {
    if (!dueDate) return null;
    const dp = dueDate.slice(0,10);
    const [y,mo,d] = dp.split("-").map(Number);
    return new Date(y, mo-1, d, 23, 59, 59, 999);
  };

  // Upcoming deadlines
  const upcoming = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const dl = parseLocal(t.dueDate);
    return dl && dl >= now;
  }).sort((a,b) => parseLocal(a.dueDate) - parseLocal(b.dueDate)).slice(0,4);

  const pColors = { 1:"#6b7280",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#dc2626" };
  const pLabels = { 1:"Low",2:"Medium",3:"High",4:"Very High",5:"Critical" };

  function daysUntil(dueDate) {
    const dl = parseLocal(dueDate);
    if (!dl) return "";
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const diffDays = Math.ceil((dl - now) / 86400000);
    if (dl <= todayEnd && dl >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0)) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    return `in ${diffDays}d`;
  }

  // Inject stats
  document.getElementById("homeStats").innerHTML = `
    <div class="home-stat-pill"><span class="hsp-val">${doneToday}</span><span class="hsp-label">Done Today</span></div>
    <div class="home-stat-pill"><span class="hsp-val">${pending}</span><span class="hsp-label">Pending</span></div>
    <div class="home-stat-pill ${overdue>0?"hsp-warn":""}"><span class="hsp-val">${overdue}</span><span class="hsp-label">Overdue</span></div>
    <div class="home-stat-pill"><span class="hsp-val">${totalDone}</span><span class="hsp-label">All Time</span></div>
  `;

  // Progress ring
  const circ = 2 * Math.PI * 36;
  document.getElementById("homeRing").innerHTML = `
    <div class="home-ring-wrap">
      <svg viewBox="0 0 88 88" class="home-ring-svg">
        <circle class="hr-bg" cx="44" cy="44" r="36"/>
        <circle class="hr-fill" cx="44" cy="44" r="36"
          stroke-dasharray="${circ.toFixed(1)}"
          stroke-dashoffset="${(circ*(1-pct/100)).toFixed(1)}"/>
      </svg>
      <div class="home-ring-label">
        <span class="home-ring-pct">${pct}%</span>
        <span class="home-ring-sub">${todayDone}/${todayTasksUniq.length} done</span>
      </div>
    </div>
  `;

  // Focus — clickable rows navigate to tasks
  document.getElementById("homeFocus").querySelector(".home-card-body").outerHTML = `
    <div class="home-card-body">${focus.length ? focus.map(t => `
      <div class="home-focus-row home-focus-link" data-taskid="${t.id}" title="Go to task">
        <span class="home-focus-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
        <div class="home-focus-info">
          <span class="home-focus-title">${t.title}</span>
          <span class="home-focus-meta">${pLabels[t.priority]||""} · ${t.type||"task"}</span>
        </div>
        <span class="home-focus-arrow">›</span>
      </div>`).join("") : `<p class="home-empty">All clear! No pending tasks ✨</p>`}
    </div>`;

  // Wire up click → navigate to tasks
  document.querySelectorAll(".home-focus-link").forEach(row => {
    row.onclick = () => {
      import("../router.js").then(({ navigate }) => navigate("tasks"));
    };
  });

  // Upcoming
  document.getElementById("homeUpcoming").querySelector(".home-card-body").outerHTML = `
    <div class="home-card-body">${upcoming.length ? upcoming.map(t => `
      <div class="home-focus-row">
        <span class="home-focus-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
        <div class="home-focus-info">
          <span class="home-focus-title">${t.title}</span>
          <span class="home-focus-meta">${daysUntil(t.dueDate)}${t.dueTime?" · "+t.dueTime:""}</span>
        </div>
      </div>`).join("") : `<p class="home-empty">No upcoming deadlines ✨</p>`}
    </div>`;

  // Streak
  document.getElementById("homeBottom").querySelector(".home-streak-card .home-card-body").outerHTML = `
    <div class="home-card-body">
      <div class="home-streak-display">
        <span class="home-streak-num">${streak}</span>
        <span class="home-streak-unit">day${streak!==1?"s":""}</span>
      </div>
      ${streak>0
        ? `<p class="home-streak-msg">${streak>=7?"You're on fire! 🔥":streak>=3?"Great consistency!":"Keep it going!"}</p>`
        : `<p class="home-streak-msg">Complete a daily task to start your streak</p>`}
    </div>`;

  document.getElementById("homeLoader").style.display = "none";
}