/* ============================================================
   BRAINSTORM — Complete Ecosystem Rewrite
   Apple-quality slide panel, mind map canvas, idea cards,
   focus write mode, tag system, idea→task conversion
   ============================================================ */
import { db, auth } from "../firebase/firebaseConfig.js";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { openColorPicker } from "../colorPicker.js";
import { addTaskToCloud } from "../firebase/firestoreService.js";
import { askGeminiList, askGemini } from "../gemini.js";

let boards = [];
let activeBoardId = null;
let selectedColor = "#00f5a0";
let viewMode = "list"; // "list" | "canvas"
let bubbles = [], dragging = null, dragOX = 0, dragOY = 0;
let canvasEl, canvasCtx, canvasAF = null;
let writeModeAF = null, writeModeT = 0;

const TAG_COLORS = [
  "#00f5a0","#00d9f5","#f97316","#ef4444",
  "#7800ff","#f59e0b","#ec4899","#06b6d4"
];

function col() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not logged in");
  return collection(db, "users", u.uid, "brainstorm");
}

/* ─────────────────────────────────────────────
   HTML TEMPLATE
───────────────────────────────────────────── */
export function renderBrainstorm() {
  return `
<div class="bs-root">

  <!-- ═══ BOARDS LOBBY ═══ -->
  <div class="bs-lobby" id="bsLobby">
    <div class="bs-lobby-header">
      <div>
        <h1 class="bs-lobby-title">Brainstorm</h1>
        <p class="bs-lobby-sub">Where ideas breathe freely</p>
      </div>
      <button class="bs-cta-btn" id="bsNewBoard">+ New Board</button>
    </div>

    <div class="bs-search-wrap">
      <svg class="bs-search-ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="6"/><path d="m15 15 3 3"/></svg>
      <input class="bs-search" id="bsSearch" placeholder="Search boards and ideas…" autocomplete="off">
    </div>

    <div class="bs-grid" id="bsGrid">
      <div class="bs-loading">Loading boards…</div>
    </div>
  </div>

  <!-- ═══ NEW BOARD MODAL ═══ -->
  <div class="bs-modal-overlay" id="bsBoardModal">
    <div class="bs-modal-box">
      <div class="bs-modal-head">
        <h2>New Board</h2>
        <button class="bs-modal-close" id="bsCloseModal">&times;</button>
      </div>
      <div class="bs-field">
        <label>Name</label>
        <input type="text" id="bsBoardName" placeholder="Project Ideas, Goals, Deep Thoughts…" autocomplete="off">
      </div>
      <div class="bs-field">
        <label>Description <span class="bs-opt">optional</span></label>
        <input type="text" id="bsBoardDesc" placeholder="What's this board for?" autocomplete="off">
      </div>
      <div class="bs-field">
        <label>Accent Color</label>
        <button class="bs-color-trigger" id="bsColorTrigger">
          <span class="bs-color-dot" id="bsColorDot" style="background:#00f5a0"></span>
          <span id="bsColorHex">#00f5a0</span>
          <span style="opacity:.4;margin-left:auto">▾</span>
        </button>
      </div>
      <div class="bs-modal-actions">
        <button class="bs-cta-btn" id="bsConfirmCreate">Create Board</button>
        <button class="bs-ghost-btn" id="bsCancelCreate">Cancel</button>
      </div>
    </div>
  </div>

  <!-- ═══ BOARD PANEL (slide-in from right) ═══ -->
  <div class="bs-panel-shell" id="bsPanelShell">
    <div class="bs-panel-bd" id="bsPanelBd"></div>
    <div class="bs-panel" id="bsPanel">

      <!-- Panel top bar -->
      <div class="bs-pt" id="bsPanelTop">
        <div class="bs-pt-accent" id="bsPtAccent"></div>
        <div class="bs-pt-info">
          <div class="bs-pt-name" id="bsPtName"></div>
          <div class="bs-pt-desc" id="bsPtDesc"></div>
        </div>
        <div class="bs-pt-acts">
          <div class="bs-view-seg" id="bsViewSeg">
            <button class="bs-seg active" id="bsSegList">☰ List</button>
            <button class="bs-seg"        id="bsSegCanvas">✦ Map</button>
          </div>
          <button class="bs-ic-btn" id="bsAiBtn" title="AI Idea Generator" style="color:var(--accent)">✦</button>
          <button class="bs-ic-btn" id="bsWriteBtn" title="Focus Write Mode">✎</button>
          <button class="bs-ic-btn" id="bsExportBtn" title="Export">↗</button>
          <button class="bs-ic-btn bs-close-btn" id="bsPanelClose">&times;</button>
        </div>
      </div>

      <!-- Tags bar -->
      <div class="bs-tags-bar" id="bsTagsBar">
        <div class="bs-tags-inner" id="bsTagsInner"></div>
        <input class="bs-tag-input" id="bsTagInput" placeholder="+ Add tag, press Enter" autocomplete="off">
      </div>

      <!-- Add idea -->
      <div class="bs-idea-add" id="bsIdeaAdd">
        <textarea class="bs-idea-ta" id="bsIdeaText" rows="2"
          placeholder="Type an idea… Enter to add"></textarea>
        <div class="bs-idea-add-row">
          <select class="bs-sel" id="bsIdeaTag"><option value="">No tag</option></select>
          <button class="bs-cta-btn bs-cta-sm" id="bsAddIdea">Add Idea</button>
        </div>
      </div>

      <!-- ── LIST VIEW ── -->
      <div class="bs-list-area" id="bsListArea">
        <div class="bs-ideas-list" id="bsIdeasList"></div>
      </div>

      <!-- ── CANVAS VIEW ── -->
      <div class="bs-canvas-area" id="bsCanvasArea">
        <canvas id="bsMindCanvas" class="bs-canvas"></canvas>
        <div class="bs-canvas-hint">
          <span class="bsch-desk">Drag · Double-click to edit · Right-click to delete</span>
          <span class="bsch-mob">Drag to move · Long-press to delete</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ FOCUS WRITE OVERLAY ═══ -->
  <div class="bs-write" id="bsWrite">
    <canvas class="bs-write-canvas" id="bsWriteCanvas"></canvas>
    <div class="bs-write-ui">
      <div class="bs-write-top">
        <span class="bs-write-board" id="bsWriteBoard"></span>
        <div style="display:flex;gap:10px">
          <span class="bs-write-count" id="bsWriteCount">0 ideas</span>
          <button class="bs-write-exit" id="bsWriteClose">Exit Focus</button>
        </div>
      </div>
      <div class="bs-write-body">
        <div class="bs-write-stream" id="bsWriteStream"></div>
        <div class="bs-write-input">
          <textarea class="bs-write-ta" id="bsWriteInput"
            placeholder="Free-write your thoughts… Enter to save"></textarea>
          <button class="bs-write-add" id="bsWriteAdd">Add ↵</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ IDEA → TASK MODAL ═══ -->
  <div class="bs-modal-overlay" id="bsConvModal">
    <div class="bs-modal-box">
      <div class="bs-modal-head">
        <h2>✨ Convert to Task</h2>
        <button class="bs-modal-close" id="bsCloseConv">&times;</button>
      </div>
      <div class="bs-field">
        <label>Task Title</label>
        <input type="text" id="bsConvTitle" placeholder="Task name…">
      </div>
      <div class="bs-field">
        <label>Subtasks <span class="bs-opt">one per line</span></label>
        <textarea id="bsConvSubs" rows="3" placeholder="Research options&#10;Draft outline&#10;Review"></textarea>
      </div>
      <div class="bs-field-row">
        <div class="bs-field">
          <label>Priority</label>
          <select id="bsConvPri">
            <option value="1">🟢 Low</option>
            <option value="2">🟡 Medium</option>
            <option value="3" selected>🟠 High</option>
            <option value="4">🔴 Very High</option>
            <option value="5">🔺 Critical</option>
          </select>
        </div>
        <div class="bs-field">
          <label>Type</label>
          <select id="bsConvType">
            <option value="daily">Daily</option>
            <option value="weekly" selected>Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>
      <div class="bs-modal-actions">
        <button class="bs-cta-btn" id="bsConvConfirm">✨ Create Task</button>
        <button class="bs-ghost-btn" id="bsConvCancel">Cancel</button>
      </div>
    </div>
  </div>

</div>`;
}

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
export async function initBrainstormLogic() {
  await loadBoards();
  setupGlobalEvents();
}

async function loadBoards() {
  try {
    const snap = await getDocs(col());
    boards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { boards = []; }
  renderGrid();
}

/* ─────────────────────────────────────────────
   GRID
───────────────────────────────────────────── */
function renderGrid(q = "") {
  const grid = document.getElementById("bsGrid");
  if (!grid) return;
  let list = boards;
  if (q) {
    const lq = q.toLowerCase();
    list = boards.filter(b =>
      b.name?.toLowerCase().includes(lq) ||
      (b.description||"").toLowerCase().includes(lq) ||
      (b.ideas||[]).some(i => (typeof i === "string" ? i : i.text||"").toLowerCase().includes(lq))
    );
  }
  if (!list.length) {
    grid.innerHTML = `<div class="bs-empty"><div class="bs-empty-emoji">💡</div><p>${q ? "No boards match your search" : "Create your first board to start brainstorming"}</p></div>`;
    return;
  }
  grid.innerHTML = list.map(b => {
    const ideas   = b.ideas || [];
    const pinned  = ideas.filter(i => i?.pinned).length;
    const preview = ideas.slice(0, 3)
      .map(i => `<div class="bs-card-idea">${(typeof i==="string" ? i : i.text||"").slice(0,55)}</div>`)
      .join("");
    const accent  = b.color || "#00f5a0";
    return `
    <div class="bs-card" data-bid="${b.id}" style="--bc:${accent}">
      <div class="bs-card-top">
        <div class="bs-card-dot" style="background:${accent}"></div>
        <div class="bs-card-meta-row">
          <span class="bs-card-count">${ideas.length} idea${ideas.length!==1?"s":""}</span>
          ${pinned ? `<span class="bs-card-pin">📌 ${pinned}</span>` : ""}
        </div>
        <button class="bs-card-del" data-delboard="${b.id}" title="Delete board">&times;</button>
      </div>
      <div class="bs-card-name">${b.name}</div>
      ${b.description ? `<div class="bs-card-desc">${b.description}</div>` : ""}
      <div class="bs-card-preview">${preview || `<div class="bs-card-empty">No ideas yet…</div>`}</div>
      <div class="bs-card-open">
        <span>Open board</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 7h10M7 2l5 5-5 5"/></svg>
      </div>
    </div>`;
  }).join("");
}

/* ─────────────────────────────────────────────
   PANEL OPEN / CLOSE
───────────────────────────────────────────── */
function openPanel(board) {
  activeBoardId = board.id;
  viewMode = "list";

  const accent = board.color || "#00f5a0";
  document.getElementById("bsPtAccent").style.background = accent;
  document.getElementById("bsPtName").textContent   = board.name;
  document.getElementById("bsPtDesc").textContent   = board.description || "";
  document.getElementById("bsPanelTop").style.borderBottomColor = accent + "55";

  // View seg reset
  document.getElementById("bsSegList").classList.add("active");
  document.getElementById("bsSegCanvas").classList.remove("active");
  document.getElementById("bsListArea").style.display   = "";
  document.getElementById("bsCanvasArea").style.display = "none";

  renderTags(board);
  renderIdeas(board);

  // Inject AI panel into panel-shell (sibling of bs-panel, so not clipped by overflow:hidden)
  document.getElementById("bsAiPanel")?.remove();
  const aiPanelEl = document.createElement("div");
  aiPanelEl.id = "bsAiPanel";
  aiPanelEl.className = "bs-ai-panel";
  aiPanelEl.style.display = "none";
  aiPanelEl.innerHTML = `
    <div class="bs-ai-panel-header">
      <div style="font-size:13px;font-weight:700;color:var(--accent)">✦ AI Idea Generator</div>
      <button id="bsAiPanelClose" class="bs-ic-btn">&times;</button>
    </div>
    <div class="bs-ai-panel-body">
      <textarea id="bsAiPrompt" class="bs-ai-prompt-ta" placeholder="Describe ideas you want… or leave blank to generate from board context" rows="3"></textarea>
      <button id="bsAiGenerate" class="bs-cta-btn" style="width:100%;margin-top:8px">Generate Ideas ✦</button>
    </div>
    <div id="bsAiResults" class="bs-ai-results">
      <div class="bs-ai-hint">Type a topic or leave blank, then hit Generate.</div>
    </div>`;
  document.getElementById("bsPanelShell").appendChild(aiPanelEl);

  document.getElementById("bsAiBtn").onclick = () => {
    const panel = document.getElementById("bsAiPanel");
    const showing = panel.style.display === "flex";
    panel.style.display = showing ? "none" : "flex";
  };
  document.getElementById("bsAiPanelClose").onclick = () => {
    document.getElementById("bsAiPanel").style.display = "none";
  };
  document.getElementById("bsAiGenerate").onclick = generateAiIdeas;

  document.getElementById("bsPanelShell").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closePanel() {
  document.getElementById("bsPanelShell").classList.remove("open");
  document.body.style.overflow = "";
  activeBoardId = null;
  cancelAnimationFrame(canvasAF);
}

/* ─────────────────────────────────────────────
   TAGS
───────────────────────────────────────────── */
function renderTags(board) {
  const tags = board.tags || [];
  const inner = document.getElementById("bsTagsInner");
  const sel   = document.getElementById("bsIdeaTag");
  inner.innerHTML = tags.map((t, i) => {
    const c = TAG_COLORS[i % TAG_COLORS.length];
    return `<span class="bs-tag" style="--tc:${c}">${t}<button class="bs-tag-x" data-dtag="${t}">&times;</button></span>`;
  }).join("");
  sel.innerHTML = `<option value="">No tag</option>` +
    tags.map(t => `<option value="${t}">${t}</option>`).join("");
}

/* ─────────────────────────────────────────────
   IDEAS LIST
───────────────────────────────────────────── */
function renderIdeas(board, q = "") {
  const el = document.getElementById("bsIdeasList");
  if (!el) return;
  let ideas = (board.ideas || []).map((x, i) => ({
    ...(typeof x === "string" ? { text: x, pinned: false, tag: "" } : x),
    _i: i
  }));
  if (q) ideas = ideas.filter(x =>
    x.text.toLowerCase().includes(q.toLowerCase()) ||
    (x.tag||"").toLowerCase().includes(q.toLowerCase())
  );
  ideas.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const tags = board.tags || [];
  el.innerHTML = ideas.length
    ? ideas.map(idea => {
        const ti = tags.indexOf(idea.tag), tc = ti>=0 ? TAG_COLORS[ti % TAG_COLORS.length] : null;
        return `
        <div class="bs-idea${idea.pinned ? " bs-idea-pinned" : ""}" data-iidx="${idea._i}">
          <div class="bs-idea-body">
            ${idea.pinned ? `<span class="bs-idea-pin">📌</span>` : ""}
            <p class="bs-idea-txt">${idea.text}</p>
          </div>
          <div class="bs-idea-row2">
            ${tc ? `<span class="bs-idea-tag" style="--tc:${tc}">${idea.tag}</span>` : `<span></span>`}
            <div class="bs-idea-acts">
              <button class="bs-act bs-act-conv" data-conv="${idea._i}" title="Convert to task">✨</button>
              <button class="bs-act bs-act-pin"  data-pin="${idea._i}"  title="${idea.pinned?"Unpin":"Pin"}">${idea.pinned?"📌":"☆"}</button>
              <button class="bs-act bs-act-del"  data-del="${idea._i}"  title="Delete">&times;</button>
            </div>
          </div>
        </div>`;
      }).join("")
    : `<div class="bs-ideas-empty">No ideas yet — add one above ↑</div>`;
}

/* ─────────────────────────────────────────────
   CANVAS MIND MAP
───────────────────────────────────────────── */
function openCanvas(board) {
  cancelAnimationFrame(canvasAF);
  canvasEl = document.getElementById("bsMindCanvas");
  canvasCtx = canvasEl.getContext("2d");
  const wrap = document.getElementById("bsCanvasArea");
  canvasEl.width  = wrap.clientWidth;
  canvasEl.height = wrap.clientHeight;

  const cx = canvasEl.width / 2, cy = canvasEl.height / 2;
  const ideas = board.ideas || [];
  const accent = board.color || "#00f5a0";

  bubbles = ideas.map((idea, i) => {
    const a = (i / Math.max(ideas.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = Math.min(cx, cy) * 0.52;
    return {
      id: i,
      text: typeof idea === "string" ? idea : idea.text,
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      c: accent
    };
  });
  bubbles.unshift({ id: -1, text: board.name, x: cx, y: cy, c: "#fff", center: true });

  drawCanvas();
  attachCanvasEvents(board);
}

function drawCanvas() {
  if (!canvasCtx || !canvasEl) return;
  const w = canvasEl.width, h = canvasEl.height;
  canvasCtx.clearRect(0,0,w,h);

  // Background
  canvasCtx.fillStyle = "#080c18";
  canvasCtx.fillRect(0,0,w,h);

  // Grid dots
  canvasCtx.fillStyle = "rgba(255,255,255,0.028)";
  for (let x = 0; x < w; x += 30)
    for (let y = 0; y < h; y += 30) {
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, 1, 0, Math.PI*2);
      canvasCtx.fill();
    }

  const ctr = bubbles.find(b => b.center);

  // Lines
  if (ctr) {
    bubbles.filter(b => !b.center).forEach(b => {
      const g = canvasCtx.createLinearGradient(ctr.x, ctr.y, b.x, b.y);
      g.addColorStop(0, "rgba(0,245,160,0.18)");
      g.addColorStop(1, "rgba(0,217,245,0.05)");
      canvasCtx.beginPath();
      canvasCtx.moveTo(ctr.x, ctr.y);
      canvasCtx.lineTo(b.x, b.y);
      canvasCtx.strokeStyle = g;
      canvasCtx.lineWidth = 1.5;
      canvasCtx.stroke();
    });
  }

  // Bubbles
  bubbles.forEach(b => {
    const r = b.center ? 52 : 40;
    // Glow
    const gl = canvasCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r + 22);
    gl.addColorStop(0, b.center ? "rgba(255,255,255,0.08)" : "rgba(0,245,160,0.1)");
    gl.addColorStop(1, "transparent");
    canvasCtx.fillStyle = gl;
    canvasCtx.beginPath(); canvasCtx.arc(b.x, b.y, r+22, 0, Math.PI*2); canvasCtx.fill();
    // Fill
    const bg = canvasCtx.createRadialGradient(b.x - r*.3, b.y - r*.3, 0, b.x, b.y, r);
    bg.addColorStop(0, b.center ? "rgba(255,255,255,0.18)" : "rgba(0,245,160,0.13)");
    bg.addColorStop(1, b.center ? "rgba(255,255,255,0.04)" : "rgba(0,245,160,0.04)");
    canvasCtx.fillStyle = bg;
    canvasCtx.beginPath(); canvasCtx.arc(b.x, b.y, r, 0, Math.PI*2); canvasCtx.fill();
    // Stroke
    canvasCtx.strokeStyle = b.center ? "rgba(255,255,255,0.35)" : "rgba(0,245,160,0.3)";
    canvasCtx.lineWidth = b.center ? 1.5 : 1;
    canvasCtx.stroke();
    // Text
    canvasCtx.fillStyle = b.center ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.78)";
    canvasCtx.font = `${b.center ? "600 " : ""}${b.center ? 13 : 11}px -apple-system,sans-serif`;
    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "middle";
    wrapText(canvasCtx, b.text, b.x, b.y, (r - 6) * 2, 14);
  });
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(" "); let line = ""; const lines = [];
  words.forEach(w => {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  });
  if (line) lines.push(line);
  const sy = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, sy + i * lh));
}

function hitBubble(mx, my) {
  return bubbles.slice().reverse().find(b => Math.hypot(mx - b.x, my - b.y) < (b.center ? 52 : 40));
}

function attachCanvasEvents(board) {
  if (!canvasEl) return;
  canvasEl.onmousedown = e => {
    const r = canvasEl.getBoundingClientRect();
    const b = hitBubble(e.clientX - r.left, e.clientY - r.top);
    if (b && !b.center) { dragging = b; dragOX = e.clientX - r.left - b.x; dragOY = e.clientY - r.top - b.y; }
  };
  canvasEl.onmousemove = e => {
    if (!dragging) return;
    const r = canvasEl.getBoundingClientRect();
    dragging.x = e.clientX - r.left - dragOX;
    dragging.y = e.clientY - r.top - dragOY;
    drawCanvas();
  };
  canvasEl.onmouseup = () => { dragging = null; };
  canvasEl.onmouseleave = () => { dragging = null; };

  // Touch
  canvasEl.ontouchstart = e => {
    const r = canvasEl.getBoundingClientRect(), t = e.touches[0];
    const b = hitBubble(t.clientX - r.left, t.clientY - r.top);
    if (b && !b.center) { dragging = b; dragOX = t.clientX - r.left - b.x; dragOY = t.clientY - r.top - b.y; }
  };
  canvasEl.ontouchmove = e => {
    e.preventDefault();
    if (!dragging) return;
    const r = canvasEl.getBoundingClientRect(), t = e.touches[0];
    dragging.x = t.clientX - r.left - dragOX;
    dragging.y = t.clientY - r.top - dragOY;
    drawCanvas();
  };
  canvasEl.ontouchend = () => { dragging = null; };

  // Double-click to edit
  canvasEl.ondblclick = async e => {
    const r = canvasEl.getBoundingClientRect();
    const b = hitBubble(e.clientX - r.left, e.clientY - r.top);
    if (b && !b.center) {
      const t = prompt("Edit idea:", b.text);
      if (t?.trim()) {
        const board = boards.find(x => x.id === activeBoardId); if (!board) return;
        const ideas = [...(board.ideas||[])];
        const obj = typeof ideas[b.id] === "string" ? { text: ideas[b.id], pinned:false, tag:"" } : { ...ideas[b.id] };
        obj.text = t.trim(); ideas[b.id] = obj;
        await saveBoard(activeBoardId, { ideas });
        openCanvas(boards.find(x => x.id === activeBoardId));
      }
    }
  };

  // Right-click to delete
  canvasEl.oncontextmenu = async e => {
    e.preventDefault();
    const r = canvasEl.getBoundingClientRect();
    const b = hitBubble(e.clientX - r.left, e.clientY - r.top);
    if (b && !b.center) {
      const board = boards.find(x => x.id === activeBoardId); if (!board) return;
      const ideas = [...(board.ideas||[])]; ideas.splice(b.id, 1);
      await saveBoard(activeBoardId, { ideas });
      openCanvas(boards.find(x => x.id === activeBoardId));
    }
  };
}

/* ─────────────────────────────────────────────
   FOCUS WRITE MODE
───────────────────────────────────────────── */
function openWrite() {
  const board = boards.find(b => b.id === activeBoardId); if (!board) return;
  document.getElementById("bsWriteBoard").textContent = board.name;
  renderWriteStream(board);
  document.getElementById("bsWrite").classList.add("open");
  startWriteCanvas();
  setTimeout(() => document.getElementById("bsWriteInput")?.focus(), 200);
}
function closeWrite() {
  document.getElementById("bsWrite").classList.remove("open");
  cancelAnimationFrame(writeModeAF);
  writeModeT = 0;
}
function renderWriteStream(board) {
  const el = document.getElementById("bsWriteStream"); if (!el) return;
  const ideas = [...(board.ideas||[])].reverse();
  el.innerHTML = ideas.map(i => `
    <div class="bsw-item">
      <p class="bsw-text">${typeof i==="string" ? i : i.text}</p>
      ${i.tag ? `<span class="bsw-tag">${i.tag}</span>` : ""}
    </div>`).join("");
  document.getElementById("bsWriteCount").textContent = `${ideas.length} idea${ideas.length!==1?"s":""}`;
}
function startWriteCanvas() {
  const c = document.getElementById("bsWriteCanvas"); if (!c) return;
  c.width = window.innerWidth; c.height = window.innerHeight;
  const ctx = c.getContext("2d");
  function draw() {
    ctx.fillStyle = "#020810"; ctx.fillRect(0, 0, c.width, c.height);
    for (let x = 0; x < c.width; x += 5) {
      const w = Math.sin(x*0.003 + writeModeT*0.008)*75 + Math.sin(x*0.006 + writeModeT*0.013)*35;
      const y = c.height/2 + w;
      const g = ctx.createLinearGradient(0, y-120, 0, y+120);
      g.addColorStop(0, "transparent");
      g.addColorStop(0.4, "rgba(0,245,160,0.12)");
      g.addColorStop(0.7, "rgba(100,0,255,0.08)");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.fillRect(x, y-120, 5, 240);
    }
    writeModeT++; writeModeAF = requestAnimationFrame(draw);
  }
  draw();
}

/* ─────────────────────────────────────────────
   SAVE
───────────────────────────────────────────── */
async function saveBoard(id, data) {
  const u = auth.currentUser;
  await updateDoc(doc(db, "users", u.uid, "brainstorm", id), data);
  const idx = boards.findIndex(b => b.id === id);
  if (idx !== -1) boards[idx] = { ...boards[idx], ...data };
}

async function addIdea() {
  const ta = document.getElementById("bsIdeaText");
  const tagSel = document.getElementById("bsIdeaTag");
  const text = ta.value.trim();
  if (!text || !activeBoardId) return;
  const board = boards.find(b => b.id === activeBoardId); if (!board) return;
  const ideas = [...(board.ideas||[]), { text, tag: tagSel.value, pinned: false }];
  await saveBoard(activeBoardId, { ideas });
  ta.value = "";
  renderIdeas(boards.find(b => b.id === activeBoardId));
  renderGrid(document.getElementById("bsSearch")?.value || "");
  if (viewMode === "canvas") openCanvas(boards.find(b => b.id === activeBoardId));
}

/* ─────────────────────────────────────────────
   EVENTS
───────────────────────────────────────────── */
function setupGlobalEvents() {
  // Search
  document.getElementById("bsSearch").oninput = e => renderGrid(e.target.value);

  // New board button
  document.getElementById("bsNewBoard").onclick = () => {
    selectedColor = "#00f5a0";
    document.getElementById("bsColorDot").style.background = selectedColor;
    document.getElementById("bsColorHex").textContent = selectedColor;
    document.getElementById("bsBoardName").value = "";
    document.getElementById("bsBoardDesc").value = "";
    document.getElementById("bsBoardModal").classList.add("open");
    setTimeout(() => document.getElementById("bsBoardName").focus(), 100);
  };

  // Board modal close
  ["bsCloseModal","bsCancelCreate"].forEach(id =>
    document.getElementById(id).onclick = () => document.getElementById("bsBoardModal").classList.remove("open")
  );

  // Color picker
  document.getElementById("bsColorTrigger").onclick = e => {
    e.stopPropagation();
    openColorPicker(document.getElementById("bsColorTrigger"), selectedColor, hex => {
      selectedColor = hex;
      document.getElementById("bsColorDot").style.background = hex;
      document.getElementById("bsColorHex").textContent = hex;
    });
  };

  // Confirm create
  document.getElementById("bsConfirmCreate").onclick = async () => {
    const name = document.getElementById("bsBoardName").value.trim(); if (!name) return;
    await addDoc(col(), {
      name,
      description: document.getElementById("bsBoardDesc").value.trim(),
      color: selectedColor, ideas: [], tags: [],
      createdAt: serverTimestamp()
    });
    document.getElementById("bsBoardModal").classList.remove("open");
    await loadBoards();
  };

  // Panel close
  document.getElementById("bsPanelClose").onclick = closePanel;

  // AI buttons wired in openPanel()
  document.getElementById("bsPanelBd").onclick = closePanel;

  // View toggle
  document.getElementById("bsSegList").onclick = () => {
    viewMode = "list";
    document.getElementById("bsSegList").classList.add("active");
    document.getElementById("bsSegCanvas").classList.remove("active");
    document.getElementById("bsListArea").style.display = "";
    document.getElementById("bsCanvasArea").style.display = "none";
    cancelAnimationFrame(canvasAF);
    renderIdeas(boards.find(b => b.id === activeBoardId));
  };
  document.getElementById("bsSegCanvas").onclick = () => {
    viewMode = "canvas";
    document.getElementById("bsSegCanvas").classList.add("active");
    document.getElementById("bsSegList").classList.remove("active");
    document.getElementById("bsListArea").style.display = "none";
    document.getElementById("bsCanvasArea").style.display = "";
    const board = boards.find(b => b.id === activeBoardId);
    if (board) openCanvas(board);
  };

  // Add idea
  document.getElementById("bsAddIdea").onclick = addIdea;
  document.getElementById("bsIdeaText").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addIdea(); }
  });

  // Tags
  document.getElementById("bsTagInput").addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    const val = e.target.value.trim(); if (!val || !activeBoardId) return;
    const board = boards.find(b => b.id === activeBoardId); if (!board) return;
    const tags = [...(board.tags||[])];
    if (!tags.includes(val)) { tags.push(val); await saveBoard(activeBoardId, { tags }); }
    e.target.value = "";
    renderTags(boards.find(b => b.id === activeBoardId));
  });

  // Export
  document.getElementById("bsExportBtn").onclick = () => {
    const b = boards.find(x => x.id === activeBoardId); if (!b) return;
    const txt = `${b.name}\n${b.description||""}\n\n${(b.ideas||[]).map((x,n)=>`${n+1}. ${typeof x==="string"?x:x.text}`).join("\n")}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt],{type:"text/plain"}));
    a.download = `${b.name.replace(/\s+/g,"-")}.txt`; a.click();
  };

  // Focus write mode
  document.getElementById("bsWriteBtn").onclick   = openWrite;
  document.getElementById("bsWriteClose").onclick  = closeWrite;
  document.getElementById("bsWriteAdd").onclick = async () => {
    const inp = document.getElementById("bsWriteInput"), text = inp.value.trim();
    if (!text || !activeBoardId) return;
    const board = boards.find(b => b.id === activeBoardId); if (!board) return;
    const ideas = [...(board.ideas||[]), { text, tag:"", pinned:false }];
    await saveBoard(activeBoardId, { ideas });
    inp.value = "";
    renderWriteStream(boards.find(b => b.id === activeBoardId));
    renderIdeas(boards.find(b => b.id === activeBoardId));
    renderGrid(document.getElementById("bsSearch")?.value||"");
  };
  document.getElementById("bsWriteInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("bsWriteAdd").click(); }
  });

  // Convert modal close
  ["bsCloseConv","bsConvCancel"].forEach(id =>
    document.getElementById(id).onclick = () => document.getElementById("bsConvModal").classList.remove("open")
  );

  // Convert confirm
  document.getElementById("bsConvConfirm").onclick = async () => {
    const title = document.getElementById("bsConvTitle").value.trim(); if (!title) return;
    const subs  = document.getElementById("bsConvSubs").value.trim();
    const subtasks = subs ? subs.split("\n").filter(l=>l.trim()).map(l=>({title:l.trim(),done:false})) : [];
    await addTaskToCloud({
      title, description: "", priority: parseInt(document.getElementById("bsConvPri").value),
      type: document.getElementById("bsConvType").value, subtasks,
      completed:false, completedAt:null, dueDate:null, dueTime:null, customDeadline:false
    });
    document.getElementById("bsConvModal").classList.remove("open");
    import("./tasksView.js").then(m => m.showToast("Task created from idea! ✨"));
  };

  // Delegated clicks
  document.addEventListener("click", async e => {
    // Delete board
    const delB = e.target.closest("[data-delboard]");
    if (delB) {
      e.stopPropagation();
      const id = delB.dataset.delboard;
      if (!confirm("Delete this board?")) return;
      const u = auth.currentUser;
      await deleteDoc(doc(db,"users",u.uid,"brainstorm",id));
      await loadBoards(); return;
    }

    // Open board card
    const card = e.target.closest(".bs-card");
    if (card && !e.target.closest("[data-delboard]")) {
      const board = boards.find(b => b.id === card.dataset.bid);
      if (board) openPanel(board); return;
    }

    // Convert to task
    if (e.target.dataset.conv !== undefined && e.target.dataset.conv !== "") {
      const board = boards.find(b => b.id === activeBoardId); if (!board) return;
      const idea  = board.ideas?.[parseInt(e.target.dataset.conv)]; if (!idea) return;
      document.getElementById("bsConvTitle").value = typeof idea==="string" ? idea : idea.text;
      document.getElementById("bsConvSubs").value = "";
      document.getElementById("bsConvModal").classList.add("open"); return;
    }

    // Pin
    if (e.target.dataset.pin !== undefined && e.target.dataset.pin !== "") {
      const idx = parseInt(e.target.dataset.pin);
      const board = boards.find(b => b.id === activeBoardId); if (!board) return;
      const ideas = (board.ideas||[]).map((x,i) => {
        const o = typeof x==="string" ? {text:x,pinned:false,tag:""} : {...x};
        if (i === idx) o.pinned = !o.pinned; return o;
      });
      await saveBoard(activeBoardId, { ideas });
      renderIdeas(boards.find(b => b.id === activeBoardId)); return;
    }

    // Delete idea
    if (e.target.dataset.del !== undefined && e.target.dataset.del !== "") {
      const idx = parseInt(e.target.dataset.del);
      const board = boards.find(b => b.id === activeBoardId); if (!board) return;
      const ideas = [...(board.ideas||[])]; ideas.splice(idx, 1);
      await saveBoard(activeBoardId, { ideas });
      renderIdeas(boards.find(b => b.id === activeBoardId));
      renderGrid(document.getElementById("bsSearch")?.value||"");
      if (viewMode === "canvas") openCanvas(boards.find(b => b.id === activeBoardId)); return;
    }

    // Delete tag
    if (e.target.dataset.dtag) {
      const board = boards.find(b => b.id === activeBoardId); if (!board) return;
      const tags  = (board.tags||[]).filter(t => t !== e.target.dataset.dtag);
      const ideas = (board.ideas||[]).map(x => typeof x==="string" ? x : {...x, tag: x.tag===e.target.dataset.dtag?"":x.tag});
      await saveBoard(activeBoardId, { tags, ideas });
      renderTags(boards.find(b => b.id === activeBoardId));
      renderIdeas(boards.find(b => b.id === activeBoardId));
    }
  });
}

// ── AI Idea Generation ────────────────────────────────────────
async function generateAiIdeas() {
  const btn     = document.getElementById("bsAiGenerate");
  const results = document.getElementById("bsAiResults");
  const promptEl = document.getElementById("bsAiPrompt");

  const board   = boards.find(b => b.id === activeBoardId);
  const userPrompt = promptEl?.value.trim();
  const existing   = (board?.ideas || []).map(i => i.text).slice(0, 10);
  const boardName  = board?.name || "brainstorm";
  const boardDesc  = board?.description || "";

  btn.disabled = true;
  btn.textContent = "Generating…";
  results.innerHTML = '<div class="bs-ai-hint" style="opacity:0.6">Thinking of ideas…</div>';

  const context = userPrompt
    ? `Topic/request: "${userPrompt}"`
    : boardDesc
      ? `Topic: "${boardDesc}" (board named "${boardName}")${existing.length ? `
Existing ideas: ${existing.join(", ")}` : ""}`
      : `Board name: "${boardName}"${existing.length ? `
Existing ideas: ${existing.join(", ")}` : ""}`;

  const prompt = `Generate 8-10 specific, actionable, creative ideas.

${context}${existing.length && !userPrompt ? `
Already on board (don't repeat): ${existing.slice(0,8).join(", ")}` : ""}

Be specific and imaginative — no vague or generic suggestions. Each idea: 1 sentence, immediately usable, distinct from the others. Mix practical with ambitious.`;

  try {
    const ideas = await askGeminiList(prompt, 450);
    if (!Array.isArray(ideas) || !ideas.length) throw new Error("No ideas returned");

    results.innerHTML = `
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08)">
        Click any idea to add it to your board
      </div>
      ${ideas.map((idea, i) => `
        <div class="bs-ai-idea-item" data-idea="${idea.replace(/"/g,'&quot;')}">
          <span class="bs-ai-idea-dot">+</span>
          <span>${idea}</span>
        </div>`).join("")}
      <div style="margin-top:12px">
        <button id="bsAiAddAll" class="bs-ghost-btn" style="width:100%;font-size:12px">+ Add All to Board</button>
      </div>`;

    // Wire click-to-add
    results.querySelectorAll(".bs-ai-idea-item").forEach(el => {
      el.onclick = async () => {
        const text = el.dataset.idea;
        await addIdeaFromAI(text);
        el.style.opacity = "0.4";
        el.style.pointerEvents = "none";
        el.querySelector(".bs-ai-idea-dot").textContent = "✓";
        el.querySelector(".bs-ai-idea-dot").style.color = "#00c87a";
      };
    });

    document.getElementById("bsAiAddAll").onclick = async () => {
      const items = results.querySelectorAll(".bs-ai-idea-item");
      for (const el of items) {
        if (el.style.opacity !== "0.4") {
          await addIdeaFromAI(el.dataset.idea);
          el.style.opacity = "0.4";
          el.querySelector(".bs-ai-idea-dot").textContent = "✓";
          el.querySelector(".bs-ai-idea-dot").style.color = "#00c87a";
        }
      }
    };

  } catch(err) {
    results.innerHTML = `<div style="color:#ef4444;font-size:12px;padding:10px">⚠ ${err.message}</div>`;
  }

  btn.disabled = false;
  btn.textContent = "Generate Ideas ✦";
}

async function addIdeaFromAI(text) {
  if (!activeBoardId || !text) return;
  const board  = boards.find(b => b.id === activeBoardId);
  const ideas  = board?.ideas ? [...board.ideas] : [];
  ideas.push({ id: Date.now().toString(), text, tag: "", color: "#00f5a0", createdAt: new Date().toISOString() });
  await saveBoard(activeBoardId, { ideas });
  // refresh list view
  const updatedBoard = boards.find(b => b.id === activeBoardId);
  if (updatedBoard) renderIdeas(updatedBoard);
}