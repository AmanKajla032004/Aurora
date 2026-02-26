import { getTasksFromCloud, addTaskToCloud } from "../firebase/firestoreService.js";

let calTasks = [];
let calYear, calMonth;
let selectedDateStr = null;
let touchStartX = 0;

/* ---- Timezone-safe date string ---- */
function localDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function renderCalendar() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
  return `
<div class="calendar-wrap">
  <div class="cal-header">
    <div class="cal-nav-group">
      <button class="cal-nav-btn" id="calPrev" aria-label="Previous month">&#8592;</button>
      <button class="cal-nav-btn" id="calNext" aria-label="Next month">&#8594;</button>
    </div>
    <div class="cal-title-group">
      <select id="calMonthSelect" class="cal-jump-select"></select>
      <select id="calYearSelect"  class="cal-jump-select"></select>
    </div>
    <button class="ghost-btn" id="calToday">Today</button>
  </div>

  <div class="cal-dow-row">
    ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("")}
  </div>
  <div class="cal-swipe-hint">← swipe to change month →</div>

  <div class="cal-grid-outer" id="calGridOuter">
    <div class="cal-grid" id="calGrid"></div>

    <!-- APPLE-STYLE BOTTOM SHEET -->
    <div class="cal-sheet" id="calSheet">
      <div class="cal-sheet-handle"></div>
      <div class="cal-sheet-header">
        <h3 id="calSheetDate">Select a day</h3>
        <button class="cal-sheet-close" id="calSheetClose" aria-label="Close">&times;</button>
      </div>
      <div class="cal-sheet-tasks" id="calSheetTasks"></div>
      <div class="cal-sheet-add">
        <div class="cal-add-field">
          <span class="cal-add-icon">+</span>
          <input type="text" id="calQuickTask" placeholder="Add task for this day…" autocomplete="off">
        </div>
        <div class="cal-add-meta">
          <select id="calTaskPriority" class="cal-add-select">
            <option value="1">🟢 Low</option>
            <option value="2">🟡 Medium</option>
            <option value="3" selected>🟠 High</option>
            <option value="4">🔴 Very High</option>
            <option value="5">🔺 Critical</option>
          </select>
          <button class="primary-btn cal-sheet-add-btn" id="calAddTask">Add</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

export async function initCalendar() {
  calTasks = await getTasksFromCloud();
  populateJumpSelects();
  renderCalendarGrid();
  setupCalendarEvents();
  setupSwipeGesture();
}

function populateJumpSelects() {
  const ms = document.getElementById("calMonthSelect");
  const ys = document.getElementById("calYearSelect");
  if (!ms || !ys) return;
  ["January","February","March","April","May","June","July","August","September","October","November","December"]
    .forEach((m, i) => ms.add(new Option(m, i, false, i === calMonth)));
  const cur = new Date().getFullYear();
  for (let y = cur - 3; y <= cur + 5; y++) ys.add(new Option(y, y, false, y === calYear));
}

function renderCalendarGrid(dir = "left") {
  const grid = document.getElementById("calGrid");
  if (!grid) return;

  const ms = document.getElementById("calMonthSelect");
  const ys = document.getElementById("calYearSelect");
  if (ms) ms.value = calMonth;
  if (ys) ys.value = calYear;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
  const todayStr    = localDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  let html = "";

  // Padding cells (previous month)
  for (let i = firstDay - 1; i >= 0; i--)
    html += `<div class="cal-day cal-day-other"><span class="cal-day-num">${daysInPrev - i}</span></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = localDateStr(calYear, calMonth, d);
    const isToday    = ds === todayStr;
    const isPast     = ds < todayStr;
    const isSelected = ds === selectedDateStr;
    // Tasks for this day:
    // 1. Tasks with exact dueDate match (weekly/monthly/once with date)
    // 2. Daily/repeating tasks that appear every day
    // 3. Once tasks with no dueDate appear on today only
    const dayTasks = calTasks.filter(t => {
      if (t.dueDate === ds) return true; // exact date match
      if ((t.type === "daily") && !t.completed) return true; // daily repeating on every day
      if (t.type === "once" && !t.dueDate && !t.completed && ds === todayStr) return true; // undated once tasks on today
      return false;
    });
    const active     = dayTasks.filter(t => !t.completed);
    const done       = dayTasks.filter(t => t.completed);
    const pCol = { 1:"#6b7280",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#dc2626" };
    const dots = active.slice(0,3).map(t=>`<span class="cal-dot" style="background:${pCol[t.priority]||"#6b7280"}"></span>`).join("")
               + (done.length ? `<span class="cal-dot cal-dot-done"></span>` : "");
    html += `
    <div class="cal-day
        ${isToday    ? "cal-today"    : ""}
        ${isPast     ? "cal-past"     : ""}
        ${isSelected ? "cal-selected" : ""}
        ${dayTasks.length ? "cal-has-tasks" : ""}"
         data-date="${ds}" role="button" tabindex="0" aria-label="${d} ${isToday ? "(today)" : ""}">
      <span class="cal-day-num">${d}</span>
      ${dayTasks.length ? `<div class="cal-dots">${dots}</div>` : ""}
      ${active.length   ? `<span class="cal-task-badge">${active.length}</span>` : ""}
    </div>`;
  }

  // Trailing padding
  const total = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let i = 1; i <= total - firstDay - daysInMonth; i++)
    html += `<div class="cal-day cal-day-other"><span class="cal-day-num">${i}</span></div>`;

  // Animate
  grid.style.animation = "none"; grid.offsetHeight;
  grid.style.animation = dir === "left" ? "calSlideLeft 0.22s ease forwards" : "calSlideRight 0.22s ease forwards";
  grid.innerHTML = html;
  attachDayClicks();
}

function attachDayClicks() {
  document.querySelectorAll(".cal-day:not(.cal-day-other)").forEach(cell => {
    cell.addEventListener("click",   () => openDaySheet(cell.dataset.date));
    cell.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") openDaySheet(cell.dataset.date); });
  });
}

function openDaySheet(ds) {
  selectedDateStr = ds;

  // Highlight
  document.querySelectorAll(".cal-day").forEach(c => c.classList.remove("cal-selected"));
  document.querySelector(`[data-date="${ds}"]`)?.classList.add("cal-selected");

  // Date label — parse parts to avoid timezone issues
  const [y, m, d] = ds.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  document.getElementById("calSheetDate").textContent =
    dateObj.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });

  const pCol  = {1:"#6b7280",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#dc2626"};
  const pLbl  = {1:"Low",2:"Medium",3:"High",4:"Very High",5:"Critical"};
  const todayLocal = localDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const tasks = calTasks.filter(t => {
    if (t.dueDate === ds) return true;
    if (t.type === "daily" && !t.completed) return true;
    if (t.type === "once" && !t.dueDate && !t.completed && ds === todayLocal) return true;
    return false;
  });
  const body  = document.getElementById("calSheetTasks");
  body.innerHTML = tasks.length
    ? tasks.map(t => `
      <div class="cal-sheet-task${t.completed ? " cal-task-done" : ""}">
        <span class="cal-sheet-dot" style="background:${pCol[t.priority]||"#6b7280"}"></span>
        <div class="cal-sheet-task-info">
          <div class="cal-sheet-task-title${t.completed ? " strikethrough" : ""}">${t.title}</div>
          <div class="cal-sheet-task-meta">${pLbl[t.priority]||""} · ${t.type}${t.dueTime ? " · "+t.dueTime : ""}</div>
        </div>
        ${t.completed ? `<span class="cal-sheet-done-badge">✓</span>` : ""}
      </div>`).join("")
    : `<p class="cal-sheet-empty">Nothing scheduled. Add a task below.</p>`;

  document.getElementById("calSheet").classList.add("cal-sheet-open");
  setTimeout(() => document.getElementById("calQuickTask")?.focus(), 280);
}

function setupSwipeGesture() {
  const outer = document.getElementById("calGridOuter");
  if (!outer) return;
  outer.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  outer.addEventListener("touchend",   e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) { // swipe left = next month
      calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendarGrid("left");
    } else { // swipe right = prev month
      calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendarGrid("right");
    }
  }, { passive: true });
}

function setupCalendarEvents() {
  document.getElementById("calPrev").onclick = () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendarGrid("right");
  };
  document.getElementById("calNext").onclick = () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendarGrid("left");
  };
  document.getElementById("calToday").onclick = () => {
    const n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth();
    renderCalendarGrid("left");
  };
  document.getElementById("calMonthSelect").onchange = e => {
    const nm = parseInt(e.target.value), dir = nm > calMonth ? "left" : "right";
    calMonth = nm; renderCalendarGrid(dir);
  };
  document.getElementById("calYearSelect").onchange = e => {
    const ny = parseInt(e.target.value), dir = ny > calYear ? "left" : "right";
    calYear = ny; renderCalendarGrid(dir);
  };
  document.getElementById("calSheetClose").onclick = () => {
    document.getElementById("calSheet").classList.remove("cal-sheet-open");
    document.querySelectorAll(".cal-day").forEach(c => c.classList.remove("cal-selected"));
    selectedDateStr = null;
  };
  document.getElementById("calAddTask").onclick = async () => {
    const input    = document.getElementById("calQuickTask");
    const title    = input.value.trim();
    if (!title || !selectedDateStr) return;
    const priority = parseInt(document.getElementById("calTaskPriority").value);
    await addTaskToCloud({
      title, type: "custom", priority,
      dueDate: selectedDateStr, dueTime: null,
      description: "", subtasks: [],
      completed: false, completedAt: null, customDeadline: true
    });
    input.value = "";
    calTasks = await getTasksFromCloud();
    renderCalendarGrid();
    openDaySheet(selectedDateStr);
  };
  document.getElementById("calQuickTask").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("calAddTask").click();
  });
}
