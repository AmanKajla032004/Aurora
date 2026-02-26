import { getTasksFromCloud } from "../firebase/firestoreService.js";
import { askGemini, askGeminiJSON } from "../gemini.js";

const QUADRANTS = [
  { key: "strengths",     label: "Strengths",     icon: "💪", sublabel: "What's working for you",   color: "#00c87a" },
  { key: "weaknesses",    label: "Weaknesses",     icon: "⚠️", sublabel: "Areas to improve",         color: "#f59e0b" },
  { key: "opportunities", label: "Opportunities",  icon: "🚀", sublabel: "Chances to grow",           color: "#38bdf8" },
  { key: "threats",       label: "Threats",        icon: "🛡", sublabel: "Risks & obstacles",         color: "#ef4444" },
];

let swotData = { strengths: [], weaknesses: [], opportunities: [], threats: [] };

export function renderSwot() {
  return `<div class="swot-page" id="swotPage">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px">
      <div>
        <h2 style="font-size:22px;font-weight:700;color:var(--text);margin:0 0 4px">SWOT Analysis</h2>
        <p style="font-size:13px;color:var(--muted);margin:0">Map your strengths, weaknesses, opportunities &amp; threats</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="swot-ai-btn" id="swotTasksBtn" style="background:rgba(0,0,0,0.08);color:var(--text);border:1.5px solid rgba(0,0,0,0.12)">📋 SWOT from my tasks</button>
        <button class="swot-ai-btn" id="swotAiBtn">✦ AI Analysis</button>
        <button style="padding:10px 16px;border-radius:22px;border:1.5px solid rgba(0,0,0,0.1);background:transparent;color:var(--muted);font-size:13px;cursor:pointer;font-family:inherit" id="swotClearBtn">Clear</button>
      </div>
    </div>

    <div class="swot-grid" id="swotGrid">
      ${QUADRANTS.map(q => `
        <div class="swot-card" id="swotCard-${q.key}">
          <div class="swot-card-header">
            <span class="swot-icon">${q.icon}</span>
            <div>
              <div class="swot-label" style="color:${q.color}">${q.label}</div>
              <div class="swot-sublabel">${q.sublabel}</div>
            </div>
          </div>
          <div class="swot-items" id="swotItems-${q.key}"></div>
          <div class="swot-add-row">
            <input class="swot-add-input" id="swotInput-${q.key}" placeholder="Add ${q.label.toLowerCase()}…" type="text" />
            <button class="swot-add-btn" data-quadrant="${q.key}">+</button>
          </div>
        </div>`).join("")}
    </div>

    <div id="swotAiResult" style="display:none" class="report-ai-card">
      <div class="report-ai-title" id="swotAiTitle">✦ AI Analysis</div>
      <div class="report-ai-body" id="swotAiBody"></div>
    </div>
  </div>`;
}

export async function initSwotLogic() {
  const saved = localStorage.getItem("aurora_swot");
  if (saved) { try { swotData = JSON.parse(saved); } catch(e) {} }
  renderAllItems();

  document.querySelectorAll(".swot-add-btn").forEach(btn => {
    btn.onclick = () => addItem(btn.dataset.quadrant);
  });
  QUADRANTS.forEach(q => {
    document.getElementById(`swotInput-${q.key}`)
      ?.addEventListener("keydown", e => { if (e.key === "Enter") addItem(q.key); });
  });

  document.getElementById("swotAiBtn")?.addEventListener("click", runManualAnalysis);
  document.getElementById("swotTasksBtn")?.addEventListener("click", runTaskSWOT);
  document.getElementById("swotClearBtn")?.addEventListener("click", () => {
    if (!confirm("Clear all SWOT items?")) return;
    swotData = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
    save(); renderAllItems();
    document.getElementById("swotAiResult").style.display = "none";
  });
}

function addItem(quadrant) {
  const input = document.getElementById(`swotInput-${quadrant}`);
  const text = input?.value.trim();
  if (!text) return;
  swotData[quadrant].push(text);
  input.value = "";
  save(); renderItems(quadrant);
}

function deleteItem(quadrant, idx) {
  swotData[quadrant].splice(idx, 1);
  save(); renderItems(quadrant);
}

function renderItems(quadrant) {
  const q = QUADRANTS.find(q => q.key === quadrant);
  const container = document.getElementById(`swotItems-${quadrant}`);
  if (!container || !q) return;
  const items = swotData[quadrant] || [];
  if (!items.length) {
    container.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:8px 2px;opacity:0.6">Nothing yet</div>`;
    return;
  }
  container.innerHTML = items.map((text, i) => `
    <div class="swot-item">
      <div class="swot-item-bullet" style="background:${q.color}"></div>
      <span class="swot-item-text">${esc(text)}</span>
      <button class="swot-item-del" data-q="${quadrant}" data-i="${i}">×</button>
    </div>`).join("");
  container.querySelectorAll(".swot-item-del").forEach(btn => {
    btn.onclick = () => deleteItem(btn.dataset.q, parseInt(btn.dataset.i));
  });
}

function renderAllItems() { QUADRANTS.forEach(q => renderItems(q.key)); }
function save() { localStorage.setItem("aurora_swot", JSON.stringify(swotData)); }
function esc(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// Manual SWOT analysis of what user typed in
async function runManualAnalysis() {
  const resultEl = document.getElementById("swotAiResult");
  const bodyEl   = document.getElementById("swotAiBody");
  const titleEl  = document.getElementById("swotAiTitle");
  const btn = document.getElementById("swotAiBtn");

  resultEl.style.display = "block";
  titleEl.innerHTML = `<div class="report-spinner"></div> ✦ Analysing…`;
  bodyEl.textContent = "";
  btn.disabled = true;

  const hasData = QUADRANTS.some(q => swotData[q.key].length > 0);

  const prompt = `You are a strategic advisor. Analyse this SWOT and give a concise strategic report in plain text (no markdown, no bullet symbols). 3-4 paragraphs. End with 3 concrete next steps labelled NEXT STEPS.

STRENGTHS: ${swotData.strengths.join(", ") || "none"}
WEAKNESSES: ${swotData.weaknesses.join(", ") || "none"}
OPPORTUNITIES: ${swotData.opportunities.join(", ") || "none"}
THREATS: ${swotData.threats.join(", ") || "none"}

${!hasData ? "The user hasn't filled in their SWOT yet. Give general advice on how to do a productive SWOT analysis and what to focus on." : ""}`;

  try {
    const text = await askGemini(prompt, 700);
    titleEl.textContent = "✦ AI Strategic Analysis";
    bodyEl.textContent = text;
  } catch(err) {
    titleEl.textContent = "✦ AI Analysis";
    bodyEl.textContent = err.message === "NO_KEY"
      ? "⚠ Gemini key not set up yet.\n\nGo to Firebase Console → Firestore → appConfig → gemini → key\nand paste your key from aistudio.google.com"
      : `⚠ Error: ${err.message}`;
  }

  btn.disabled = false;
}

// Auto-generate SWOT from the user's actual tasks
async function runTaskSWOT() {
  const resultEl = document.getElementById("swotAiResult");
  const bodyEl   = document.getElementById("swotAiBody");
  const titleEl  = document.getElementById("swotAiTitle");
  const btn = document.getElementById("swotTasksBtn");

  resultEl.style.display = "block";
  titleEl.innerHTML = `<div class="report-spinner"></div> ✦ Analysing your tasks…`;
  bodyEl.textContent = "";
  btn.disabled = true;

  let tasks = [];
  try { tasks = await getTasksFromCloud(); } catch(e) {}

  if (!tasks.length) {
    titleEl.textContent = "✦ Task SWOT";
    bodyEl.textContent = "No tasks found. Add tasks first, then use this to auto-generate your SWOT.";
    btn.disabled = false;
    return;
  }

  const now = new Date();
  const done = tasks.filter(t => t.completed);
  const pending = tasks.filter(t => !t.completed);
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now);
  const highDone = done.filter(t => (t.priority || 0) >= 4);
  const dailyStreak = (() => {
    const days = new Set(tasks.filter(t => t.type === "daily" && t.completed && t.completedAt).map(t => {
      const d = new Date(t.completedAt.seconds ? t.completedAt.seconds * 1000 : t.completedAt);
      return d.toDateString();
    }));
    let s = 0;
    for (let i = 0; i <= 60; i++) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      if (days.has(d.toDateString())) s++; else if (i > 0) break;
    }
    return s;
  })();

  const prompt = `You are a productivity analyst. Based on this person's task data, generate a SWOT analysis AND also populate specific items for each quadrant.

TASK DATA:
- Total tasks: ${tasks.length}
- Completed: ${done.length} (${tasks.length ? Math.round(done.length/tasks.length*100) : 0}%)
- Pending: ${pending.length}
- Overdue: ${overdue.length}
- Daily streak: ${dailyStreak} days
- High-priority completed: ${highDone.slice(0,5).map(t => t.title + (t.description ? " (" + t.description + ")" : "")).join(", ") || "none"}
- Overdue tasks: ${overdue.slice(0,5).map(t => t.title + (t.description ? " (" + t.description + ")" : "")).join(", ") || "none"}
- Recent completions: ${done.slice(-6).map(t => t.title + (t.description ? " (" + t.description + ")" : "")).join(", ") || "none"}

Respond ONLY with valid JSON in this exact format, no other text:
{
  "strengths": ["item1", "item2", "item3"],
  "weaknesses": ["item1", "item2"],
  "opportunities": ["item1", "item2"],
  "threats": ["item1", "item2"],
  "summary": "2-3 sentence plain text strategic summary based on the data"
}`;

  try {
    const result = await askGeminiJSON(prompt, 500);

    // Merge into swotData (add AI items, don't overwrite user items)
    QUADRANTS.forEach(q => {
      const aiItems = result[q.key] || [];
      aiItems.forEach(item => {
        if (!swotData[q.key].includes(item)) swotData[q.key].push(item);
      });
    });
    save();
    renderAllItems();

    titleEl.textContent = "✦ Task SWOT — Added to your board";
    bodyEl.textContent = result.summary || "AI items added to each quadrant above.";
  } catch(err) {
    titleEl.textContent = "✦ Task SWOT";
    bodyEl.textContent = err.message === "NO_KEY"
      ? "⚠ Gemini key not configured. See Firebase Console → appConfig → gemini."
      : `⚠ Error: ${err.message}`;
  }

  btn.disabled = false;
}