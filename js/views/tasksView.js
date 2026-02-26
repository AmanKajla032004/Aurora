import {
  addTaskToCloud, getTasksFromCloud, deleteTaskFromCloud,
  completeTaskInCloud, updateTaskInCloud
} from "../firebase/firestoreService.js";
import { askGeminiJSON } from "../gemini.js";

let allTasks = [];
let showMonthly = false, showYearly = false;
let completedFilter = null, sortBy = "priority";
let dragSrcId = null, editingTaskId = null, pendingSubtasks = [], subtaskDragSrc = null;

document.addEventListener("keydown", (e) => {
  if (e.key === "n" && !e.ctrlKey && !e.metaKey &&
      document.activeElement.tagName !== "INPUT" &&
      document.activeElement.tagName !== "TEXTAREA") {
    document.getElementById("openTaskModal")?.click();
  }
});

export function showToast(message, type = "success") {
  const ex = document.getElementById("aurora-toast");
  if (ex) ex.remove();
  const t = document.createElement("div");
  t.id = "aurora-toast";
  t.className = `aurora-toast toast-${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("toast-visible"), 10);
  setTimeout(() => { t.classList.remove("toast-visible"); setTimeout(() => t.remove(), 400); }, 2800);
}

function getAutoDeadline(type) {
  const now = new Date();
  if (type === "weekly")  { const e = new Date(now); e.setDate(now.getDate()+(7-now.getDay())); return e.toISOString().split("T")[0]; }
  if (type === "monthly") return new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split("T")[0];
  if (type === "yearly")  return `${now.getFullYear()}-12-31`;
  return "";
}

const REPEAT_DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function renderTasks() {
  return `
<div class="tasks-container">
  <div class="task-header">
    <button class="add-task-btn" id="openTaskModal">+ Add New Task <kbd class="kbd-hint">N</kbd></button>
    <div class="task-header-right">
      <div class="sort-control">
        <label class="sort-label">Sort</label>
        <div class="sort-pills">
          <button class="sort-pill active" data-sort="priority">Priority</button>
          <button class="sort-pill" data-sort="dueDate">Due Date</button>
          <button class="sort-pill" data-sort="createdAt">Newest</button>
        </div>
      </div>
      <button class="ghost-btn" id="toggleMonthly">Monthly</button>
      <button class="ghost-btn" id="toggleYearly">Yearly</button>
    </div>
  </div>
  <div class="completed-filter-row">
    <button class="ghost-btn filter-btn" data-completed="today">Today</button>
    <button class="ghost-btn filter-btn" data-completed="week">This Week</button>
    <button class="ghost-btn filter-btn" data-completed="month">This Month</button>
    <button class="ghost-btn filter-btn" data-completed="year">This Year</button>
  </div>
  <div id="taskContent"></div>

  <!-- TASK MODAL -->
  <div class="task-modal-overlay" id="taskModal">
    <div class="task-modal">
      <div class="modal-header">
        <h2 id="modalTitle">Create Task</h2>
        <button id="closeTaskModal" class="modal-close-btn">&times;</button>
      </div>

      <!-- Step 1: Title + Priority -->
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="taskTitle" placeholder="What needs to be done?" autocomplete="off">
      </div>
      <div class="form-group">
        <label>Description <span style="font-weight:400;opacity:0.5;font-size:11px">(optional)</span></label>
        <textarea id="taskDescription" placeholder="Any extra notes..." rows="2"></textarea>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <div class="priority-pills" id="priorityPills">
          <button type="button" class="priority-pill" data-val="1">🟢 Low</button>
          <button type="button" class="priority-pill active" data-val="3">🟠 High</button>
          <button type="button" class="priority-pill" data-val="4">🔴 Very High</button>
          <button type="button" class="priority-pill" data-val="5">🔺 Critical</button>
        </div>
        <input type="hidden" id="taskPriority" value="3">
      </div>

      <!-- Step 2: How often? -->
      <div class="form-group">
        <label>How often?</label>
        <div class="freq-pills" id="freqPills">
          <button type="button" class="freq-pill active" data-freq="once">Once</button>
          <button type="button" class="freq-pill" data-freq="daily">Daily</button>
          <button type="button" class="freq-pill" data-freq="weekly">Weekly</button>
          <button type="button" class="freq-pill" data-freq="monthly">Monthly</button>
          <button type="button" class="freq-pill" data-freq="yearly">Yearly</button>
        </div>
        <input type="hidden" id="taskType" value="once">
      </div>

      <!-- Step 3a: Repeat? (daily only) -->
      <div id="repeatSection" style="display:none" class="form-group">
        <label>Repeat on</label>
        <div class="repeat-days-row" id="repeatDaysBtns">
          ${REPEAT_DAYS.map(d => `<button type="button" class="repeat-day-btn" data-day="${d}">${d}</button>`).join("")}
        </div>
        <p style="font-size:11px;color:var(--muted);margin-top:6px">Leave all unselected = every day</p>
      </div>

      <!-- Step 3b: Due date (once / weekly / monthly / yearly) -->
      <div id="dueDateSection" style="display:none" class="form-group">
        <label id="dueDateLabel">Due date <span style="font-weight:400;opacity:0.5;font-size:11px">(optional)</span></label>
        <div class="form-row">
          <input type="date" id="taskDueDate" style="flex:1">
          <input type="time" id="taskDueTime" style="flex:1">
        </div>
      </div>

      <!-- Subtasks -->
      <div class="form-group">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label style="margin:0">Subtasks <span style="font-weight:400;font-size:11px;opacity:0.5">(Enter to add)</span></label>
          <button id="aiBreakdownBtn" style="padding:5px 12px;border-radius:20px;border:1.5px solid rgba(0,245,160,0.4);background:transparent;color:#00f5a0;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:0.5px;transition:all 0.2s;white-space:nowrap">✦ AI Break Down</button>
        </div>
        <div id="aiBreakdownResult" style="display:none;padding:10px 12px;border-radius:10px;background:rgba(0,245,160,0.05);border:1px solid rgba(0,245,160,0.2);font-size:12px;color:var(--muted);margin-bottom:8px"></div>
        <div class="subtask-input-row">
          <input type="text" id="subtaskInput" placeholder="Add a subtask..." autocomplete="off">
          <button id="addSubtaskBtn" class="ghost-btn">+ Add</button>
        </div>
        <div id="subtaskList" class="subtask-list"></div>
      </div>

      <div class="modal-actions">
        <button id="createTaskBtn" class="primary-btn">Create Task</button>
        <button id="closeTaskModal2" class="ghost-btn">Cancel</button>
      </div>
    </div>
  </div>
</div>`;
}

export async function initTasksLogic() {
  await loadTasks();
  setupEvents();
}

async function loadTasks() {
  allTasks = await getTasksFromCloud();
  renderSections();
}

function sortTasks(tasks) {
  return [...tasks].sort((a,b) => {
    if (sortBy === "priority") return (b.priority||0)-(a.priority||0);
    if (sortBy === "dueDate") { if(!a.dueDate) return 1; if(!b.dueDate) return -1; return new Date(a.dueDate)-new Date(b.dueDate); }
    if (sortBy === "createdAt") return (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0);
    return 0;
  });
}

function calculateStreak(tasks) {
  const days = new Set(tasks.filter(t=>t.type==="daily"&&t.completed&&t.completedAt).map(t=>{
    const d=new Date(t.completedAt.seconds?t.completedAt.seconds*1000:t.completedAt); return d.toDateString();
  }));
  let streak=0; const today=new Date();
  for(let i=0;i<=365;i++){ const d=new Date(today); d.setDate(today.getDate()-i); if(days.has(d.toDateString())) streak++; else if(i>0) break; }
  return streak;
}

function renderSections() {
  const container = document.getElementById("taskContent"); if (!container) return;
  const now = new Date();
  const streak = calculateStreak(allTasks);
  // "once" tasks = one-time tasks for today; show alongside daily
  const activeDaily   = sortTasks(allTasks.filter(t=>(t.type==="daily"||t.type==="once")&&!t.completed));
  const activeWeekly  = sortTasks(allTasks.filter(t=>t.type==="weekly"&&!t.completed));
  const activeCustom  = sortTasks(allTasks.filter(t=>t.type==="custom"&&!t.completed));
  const activeMissed  = sortTasks(allTasks.filter(t=>!t.completed&&t.dueDate&&new Date(t.dueDate)<now));
  let completedTasks = [];
  if (completedFilter) {
    completedTasks = sortTasks(allTasks.filter(t=>{
      if(!t.completed||!t.completedAt) return false;
      const cd=new Date(t.completedAt.seconds?t.completedAt.seconds*1000:t.completedAt), diff=now-cd;
      if(completedFilter==="today") return cd.toDateString()===now.toDateString();
      if(completedFilter==="week")  return diff<=7*86400000;
      if(completedFilter==="month") return diff<=30*86400000;
      if(completedFilter==="year")  return diff<=365*86400000;
      return false;
    }));
  }
  container.innerHTML = `
    ${streak>0?`<div class="streak-banner"><span class="streak-fire">🔥</span><span><strong>${streak} day streak!</strong> You're building momentum.</span></div>`:""}
    ${renderBlock("Today's Tasks",  activeDaily,  false, "daily")}
    ${renderBlock("Weekly Tasks",   activeWeekly, false, "weekly")}
    ${activeCustom.length?renderBlock("Custom Tasks", activeCustom, false, "custom"):""}
    ${activeMissed.length?renderBlock("Missed Tasks", activeMissed, false, "missed"):""}
    ${showMonthly?renderBlock("Monthly Goals", sortTasks(allTasks.filter(t=>t.type==="monthly"&&!t.completed)), false, "monthly"):""}
    ${showYearly ?renderBlock("Yearly Goals",  sortTasks(allTasks.filter(t=>t.type==="yearly"&&!t.completed)),  false, "yearly") :""}
    ${completedFilter?renderBlock("Completed", completedTasks, true, "completed"):""}`;
  attachDragEvents();
}

function renderBlock(title, tasks, isCompleted=false, blockId="") {
  return `<div class="task-block">
    <h2 class="task-block-title">${title} <span class="task-count">${tasks.length}</span></h2>
    <div class="task-list" data-block="${blockId}">
      ${tasks.length?tasks.map(t=>renderTaskItem(t,isCompleted)).join(""):`<div class="task-empty">No tasks here yet.</div>`}
    </div></div>`;
}

function renderTaskItem(task, isCompleted=false) {
  const pColors={1:"#6b7280",2:"#f59e0b",3:"#f97316",4:"#ef4444",5:"#dc2626"};
  const pLabels={1:"Low",2:"Med",3:"High",4:"V.High",5:"Crit"};
  const color=pColors[task.priority]||"#6b7280";
  const subtasks=task.subtasks||[], done=subtasks.filter(s=>s.done).length;
  const deadlineStr = task.dueDate?`📅 ${task.dueDate}${task.dueTime?" "+task.dueTime:""}`:""
  const repeatStr   = task.repeatType && task.repeatType !== "everyday" ? `🔁 ${repeatLabel(task)}` : "";
  return `
    <div class="task-item ${isCompleted?"task-completed":""}" data-id="${task.id}" draggable="${!isCompleted}">
      <div class="drag-handle">⠿</div>
      <div class="task-priority-stripe" style="background:${color}"></div>
      <div class="task-left">
        <div style="flex:1;min-width:0">
          <div class="task-title ${isCompleted?"strikethrough":""}">${task.title}</div>
          ${task.description?`<div class="task-desc">${task.description}</div>`:""}
          <div class="task-meta">
            <span class="task-badge">${task.type.toUpperCase()}</span>
            <span class="task-badge" style="background:${color}22;color:${color};border-color:${color}44">${pLabels[task.priority]||""}</span>
            ${deadlineStr?`<span class="task-badge">${deadlineStr}</span>`:""}
            ${repeatStr?`<span class="task-badge">${repeatStr}</span>`:""}
          </div>
          ${subtasks.length?`
            <div class="subtask-progress">
              <div class="subtask-progress-bar"><div class="subtask-progress-fill" style="width:${Math.round((done/subtasks.length)*100)}%"></div></div>
              <span class="subtask-count-label">${done}/${subtasks.length}</span>
            </div>
            <div class="subtask-items">${subtasks.map((s,i)=>`
              <label class="subtask-check ${s.done?"subtask-done":""}">
                <input type="checkbox" ${s.done?"checked":""} data-taskid="${task.id}" data-subtask="${i}" class="subtask-checkbox">
                <span>${s.title}</span>
              </label>`).join("")}</div>`:""}
        </div>
      </div>
      <div class="task-actions">
        ${!isCompleted?`<button data-complete="${task.id}" class="complete-btn">✓</button><button data-edit="${task.id}" class="edit-btn">✎</button>`:""}
        <button data-delete="${task.id}" class="delete-btn">✕</button>
      </div>
    </div>`;
}

function repeatLabel(task) {
  if (!task.repeatType || task.repeatType === "everyday") return "Every day";
  if (task.repeatType === "weekdays") return "Mon–Fri";
  if (task.repeatType === "weekends") return "Sat–Sun";
  if (task.repeatType === "custom" && task.repeatDays?.length) return task.repeatDays.join(", ");
  return "";
}

function attachDragEvents() {
  let dropIndicator = null;

  document.querySelectorAll(".task-item[draggable='true']").forEach(item => {
    item.addEventListener("dragstart", e => {
      dragSrcId = item.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragSrcId);
      // Delay adding class so drag image captures clean state
      requestAnimationFrame(() => item.classList.add("dragging"));
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      document.querySelectorAll(".task-item").forEach(i => i.classList.remove("drag-over"));
      dropIndicator?.remove(); dropIndicator = null;
      dragSrcId = null;
    });

    item.addEventListener("dragover", e => {
      e.preventDefault();
      if (item.dataset.id === dragSrcId) return;
      e.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".task-item").forEach(i => i.classList.remove("drag-over"));
      item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", async e => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragSrcId || dragSrcId === item.dataset.id) return;

      const srcTask = allTasks.find(t => t.id === dragSrcId);
      const dstTask = allTasks.find(t => t.id === item.dataset.id);
      if (!srcTask || !dstTask) return;

      // Same block: swap priorities
      if (srcTask.type === dstTask.type) {
        const srcPri = srcTask.priority, dstPri = dstTask.priority;
        if (srcPri !== dstPri) {
          srcTask.priority = dstPri;
          dstTask.priority = srcPri;
          // Optimistic UI — just re-sort without full reload
          renderSections();
          // Persist in background
          try {
            await updateTaskInCloud(srcTask.id, { priority: srcTask.priority });
            await updateTaskInCloud(dstTask.id, { priority: dstTask.priority });
          } catch(err) { console.error("Priority swap failed", err); }
        }
      } else {
        // Different blocks: reorder in array only (visual sort)
        const si = allTasks.findIndex(t => t.id === dragSrcId);
        const di = allTasks.findIndex(t => t.id === item.dataset.id);
        if (si !== -1 && di !== -1) {
          const [m] = allTasks.splice(si, 1);
          allTasks.splice(di, 0, m);
          renderSections();
        }
      }

      item.classList.remove("drag-over");
      dragSrcId = null;
    });
  });
}

function renderSubtaskList() {
  const list=document.getElementById("subtaskList"); if(!list) return;
  list.innerHTML=pendingSubtasks.map((s,i)=>`
    <div class="subtask-row" draggable="true" data-index="${i}">
      <span class="subtask-drag-handle">⠿</span>
      <span class="subtask-row-title">${s.title}</span>
      <button class="subtask-remove" data-index="${i}">&times;</button>
    </div>`).join("");
  list.querySelectorAll(".subtask-row").forEach(row=>{
    row.addEventListener("dragstart",e=>{subtaskDragSrc=parseInt(row.dataset.index);row.classList.add("dragging");e.dataTransfer.effectAllowed="move";});
    row.addEventListener("dragend",()=>{row.classList.remove("dragging");list.querySelectorAll(".subtask-row").forEach(r=>r.classList.remove("drag-over"));});
    row.addEventListener("dragover",e=>{e.preventDefault();list.querySelectorAll(".subtask-row").forEach(r=>r.classList.remove("drag-over"));row.classList.add("drag-over");});
    row.addEventListener("drop",e=>{e.preventDefault();const di=parseInt(row.dataset.index);if(subtaskDragSrc===di)return;const[m]=pendingSubtasks.splice(subtaskDragSrc,1);pendingSubtasks.splice(di,0,m);renderSubtaskList();});
  });
  list.querySelectorAll(".subtask-remove").forEach(btn=>{btn.onclick=()=>{pendingSubtasks.splice(parseInt(btn.dataset.index),1);renderSubtaskList();};});
}

function updateModalUI() {
  const type = document.getElementById("taskType").value;
  const repeatSection  = document.getElementById("repeatSection");
  const dueDateSection = document.getElementById("dueDateSection");
  const dueDateLabel   = document.getElementById("dueDateLabel");

  // Show repeat days only for daily
  if (repeatSection) repeatSection.style.display = type === "daily" ? "flex" : "none";

  // Show due date for once/weekly/monthly/yearly, not daily
  if (dueDateSection) {
    dueDateSection.style.display = type === "daily" ? "none" : "flex";
    if (dueDateLabel) {
      const labels = { once:"Due date", weekly:"Due by end of week", monthly:"Due by end of month", yearly:"Due by end of year" };
      dueDateLabel.innerHTML = (labels[type] || "Due date") + ' <span style="font-weight:400;opacity:0.5;font-size:11px">(optional)</span>';
      // Auto-fill date for weekly/monthly/yearly
      const dateInput = document.getElementById("taskDueDate");
      if (dateInput && !dateInput.value && type !== "once") {
        dateInput.value = getAutoDeadline(type) || "";
      }
    }
  }
}

let selectedRepeatDays = [];

function openModal(task=null) {
  editingTaskId   = task ? task.id : null;
  pendingSubtasks = task ? (task.subtasks||[]).map(s=>({...s})) : [];
  selectedRepeatDays = task?.repeatDays ? [...task.repeatDays] : [];
  document.getElementById("modalTitle").textContent   = task ? "Edit Task"    : "Create Task";
  document.getElementById("createTaskBtn").textContent = task ? "Save Changes" : "Create Task";
  document.getElementById("taskTitle").value           = task?.title || "";
  document.getElementById("taskDescription").value     = task?.description || "";

  // Restore priority pills
  const pri = task?.priority || 3;
  document.getElementById("taskPriority").value = pri;
  document.querySelectorAll(".priority-pill").forEach(p => p.classList.toggle("active", parseInt(p.dataset.val) === pri));

  // Restore frequency pills
  const freq = task?.type || "once";
  document.getElementById("taskType").value = freq;
  document.querySelectorAll(".freq-pill").forEach(p => p.classList.toggle("active", p.dataset.freq === freq));

  // Restore due date
  const dueDateEl = document.getElementById("taskDueDate");
  const dueTimeEl = document.getElementById("taskDueTime");
  if (dueDateEl) dueDateEl.value = task?.dueDate || "";
  if (dueTimeEl) dueTimeEl.value = task?.dueTime || "";
  updateModalUI();
  renderSubtaskList();
  highlightRepeatDays();
  document.getElementById("taskModal").style.display = "flex";
  setTimeout(() => document.getElementById("taskTitle")?.focus(), 100);
}

function highlightRepeatDays() {
  document.querySelectorAll(".repeat-day-btn").forEach(btn => {
    btn.classList.toggle("active", selectedRepeatDays.includes(btn.dataset.day));
  });
}

function closeModal() {
  document.getElementById("taskModal").style.display = "none";
  editingTaskId = null; pendingSubtasks = []; selectedRepeatDays = [];
}

function setupEvents() {
  // ── Frequency pills (Once / Daily / Weekly / Monthly / Yearly) ──
  document.querySelectorAll(".freq-pill").forEach(pill => {
    pill.onclick = () => {
      document.querySelectorAll(".freq-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      document.getElementById("taskType").value = pill.dataset.freq;
      // Reset date fields when switching
      const d = document.getElementById("taskDueDate");
      const t = document.getElementById("taskDueTime");
      if (d) d.value = "";
      if (t) t.value = "";
      updateModalUI();
    };
  });

  // ── Priority pills ──
  document.querySelectorAll(".priority-pill").forEach(pill => {
    pill.onclick = () => {
      document.querySelectorAll(".priority-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      document.getElementById("taskPriority").value = pill.dataset.val;
    };
  });

  // ── Repeat day buttons ──
  document.querySelectorAll(".repeat-day-btn").forEach(btn => {
    btn.onclick = () => {
      const d = btn.dataset.day;
      if (selectedRepeatDays.includes(d)) selectedRepeatDays = selectedRepeatDays.filter(x => x !== d);
      else selectedRepeatDays.push(d);
      highlightRepeatDays();
    };
  });

  document.getElementById("openTaskModal").onclick = () => openModal();
  document.getElementById("closeTaskModal").onclick  = closeModal;
  document.getElementById("closeTaskModal2").onclick = closeModal;
  document.getElementById("taskModal").onclick = e => { if (e.target === document.getElementById("taskModal")) closeModal(); };

  document.getElementById("addSubtaskBtn").onclick = () => {
    const input = document.getElementById("subtaskInput"), val = input.value.trim();
    if (!val) return; pendingSubtasks.push({title:val,done:false}); input.value = ""; renderSubtaskList();
  };
  document.getElementById("subtaskInput").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("addSubtaskBtn").click(); });

  // ── AI Task Breakdown ──────────────────────────────────────────
  document.getElementById("aiBreakdownBtn").onclick = async () => {
    const titleEl  = document.getElementById("taskTitle");
    const descEl   = document.getElementById("taskDesc");
    const typeEl   = document.querySelector(".freq-pill.active");
    const resultEl = document.getElementById("aiBreakdownResult");
    const btn      = document.getElementById("aiBreakdownBtn");

    const title = titleEl?.value.trim();
    const desc  = descEl?.value.trim();
    const type  = typeEl?.dataset?.freq || "";
    if (!title) { titleEl?.focus(); showToast("Enter a task title first","error"); return; }

    btn.disabled = true;
    btn.textContent = "✦ Thinking…";
    resultEl.style.display = "block";
    resultEl.style.color = "var(--muted)";
    resultEl.textContent = "Analysing your task…";

    try {
      const ctxLines = [];
      if (desc)  ctxLines.push(`DESCRIPTION: "${desc}"`);
      if (type)  ctxLines.push(`TYPE: ${type} task`);
      const ctx = ctxLines.length ? "\n" + ctxLines.join("\n") : "";

      const prompt = `You are a productivity expert helping someone break a task into clear steps.

TASK: "${title}"${ctx}

Create 3-7 subtasks that are:
- Ordered logically (what to do first to last)
- Specific and doable in one sitting
- Starting with action verbs (Research, Write, Set up, Review, Test, Design, etc.)
- Practical — what you would actually DO

Return ONLY a raw JSON array of strings. No markdown, no explanation.
Example: ["Research competitors", "Sketch layout ideas", "Write copy", "Get feedback", "Publish"]`;

      const subtasks = await askGeminiJSON(prompt, 400);

      if (Array.isArray(subtasks) && subtasks.length) {
        subtasks.forEach(s => {
          const text = (typeof s === "string" ? s : (s.title || s.step || "")).trim();
          if (text && !pendingSubtasks.find(p => p.title === text)) {
            pendingSubtasks.push({ title: text, done: false });
          }
        });
        renderSubtaskList();
        resultEl.textContent = `✓ Added ${subtasks.length} subtasks`;
        resultEl.style.color = "#00c87a";
        setTimeout(() => { resultEl.style.display = "none"; }, 3000);
      } else {
        resultEl.textContent = "Try a more specific task title.";
        resultEl.style.color = "#f59e0b";
      }
    } catch(err) {
      resultEl.textContent = `⚠ ${err.message}`;
      resultEl.style.color = "#ef4444";
    }

    btn.disabled = false;
    btn.textContent = "✦ AI Break Down";
  };

  document.getElementById("createTaskBtn").onclick = async () => {
    const title = document.getElementById("taskTitle").value.trim();
    if (!title) { document.getElementById("taskTitle").focus(); return; }
    const type = document.getElementById("taskType").value;
    let dueDate=null, dueTime=null, customDeadline=false;
    // Simplified: all types use taskDueDate/taskDueTime from the unified date section
    let repeatType = "everyday", repeatDays = [];
    if (type === "daily") {
      // repeat days = selected day buttons (empty = every day)
      repeatDays = [...selectedRepeatDays];
      repeatType = repeatDays.length ? "custom" : "everyday";
    } else {
      dueDate = document.getElementById("taskDueDate")?.value || null;
      dueTime = document.getElementById("taskDueTime")?.value || null;
      customDeadline = !!dueDate;
    }
    const data = { title, description:document.getElementById("taskDescription").value, priority:parseInt(document.getElementById("taskPriority").value), type, dueDate, dueTime, customDeadline, subtasks:pendingSubtasks, repeatType, repeatDays };
    if (editingTaskId) { await updateTaskInCloud(editingTaskId,data); showToast("Task updated!"); }
    else { await addTaskToCloud({...data,completed:false,completedAt:null}); showToast("Task created!"); }
    closeModal(); await loadTasks();
  };

  document.querySelectorAll(".sort-pill").forEach(pill => { pill.onclick = () => { sortBy=pill.dataset.sort; document.querySelectorAll(".sort-pill").forEach(p=>p.classList.remove("active")); pill.classList.add("active"); renderSections(); }; });
  document.getElementById("toggleMonthly").onclick = () => { showMonthly=!showMonthly; document.getElementById("toggleMonthly").classList.toggle("active-filter",showMonthly); renderSections(); };
  document.getElementById("toggleYearly").onclick  = () => { showYearly=!showYearly;   document.getElementById("toggleYearly").classList.toggle("active-filter",showYearly);   renderSections(); };
  document.querySelectorAll(".filter-btn").forEach(btn => { btn.onclick = () => { const v=btn.dataset.completed; completedFilter=completedFilter===v?null:v; document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active-filter")); if(completedFilter) btn.classList.add("active-filter"); renderSections(); }; });

  document.addEventListener("click", async e => {
    // Delete task
    if (e.target.dataset.delete) {
      const id = e.target.dataset.delete;
      // Optimistic: remove from DOM and local array immediately
      const el = document.querySelector(`.task-item[data-id="${id}"]`);
      if (el) { el.style.opacity="0"; el.style.transform="scale(0.96)"; el.style.transition="all 0.18s"; setTimeout(()=>el.remove(),180); }
      allTasks = allTasks.filter(t => t.id !== id);
      await deleteTaskFromCloud(id);
      showToast("Deleted.","error");
      return;
    }

    // Complete task — optimistic in-place update, NO full re-render
    if (e.target.dataset.complete) {
      const id = e.target.dataset.complete;
      const task = allTasks.find(t => t.id === id);
      if (!task) return;

      // Mark locally
      task.completed = true;
      task.completedAt = new Date();

      // Visual update: fade & move without full re-render
      const el = document.querySelector(`.task-item[data-id="${id}"]`);
      if (el) {
        el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        el.style.opacity = "0";
        el.style.transform = "translateX(20px)";
        setTimeout(() => {
          el.remove();
          // Update streak count in header if shown
          const streakEl = document.getElementById("streakCount");
          if (streakEl) streakEl.textContent = parseInt(streakEl.textContent||0)+1;
        }, 300);
      }

      showToast("Done! 💪");
      await completeTaskInCloud(id);
      // Silently refresh allTasks in background for accuracy
      allTasks = await getTasksFromCloud();
      return;
    }

    if (e.target.dataset.edit) {
      const t = allTasks.find(t => t.id === e.target.dataset.edit);
      if (t) openModal(t);
    }
  });

  document.addEventListener("change", async e => {
    if (e.target.classList.contains("subtask-checkbox")) {
      const taskId = e.target.dataset.taskid, subIdx = parseInt(e.target.dataset.subtask);
      const task = allTasks.find(t => t.id === taskId);
      if (!task?.subtasks) return;
      // Optimistic update
      task.subtasks[subIdx].done = e.target.checked;
      const label = e.target.closest(".subtask-check");
      if (label) label.classList.toggle("subtask-done", e.target.checked);
      // Update progress bar
      const done = task.subtasks.filter(s=>s.done).length;
      const total = task.subtasks.length;
      const pct = total ? (done/total*100) : 0;
      const fill = document.querySelector(`.task-item[data-id="${taskId}"] .subtask-progress-fill`);
      const cnt  = document.querySelector(`.task-item[data-id="${taskId}"] .subtask-count-label`);
      if (fill) fill.style.width = pct + "%";
      if (cnt)  cnt.textContent = `${done}/${total}`;
      await updateTaskInCloud(taskId, {subtasks: task.subtasks});
    }
  });
}
