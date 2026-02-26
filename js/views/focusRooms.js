/* ============================================================
   FOCUS ROOMS — Enhanced with passkey, never-ending mode,
   member presence, elapsed tracking, delete room
   ============================================================ */
import { db, auth } from "../firebase/firebaseConfig.js";
import {
  collection, addDoc, getDocs, onSnapshot,
  doc, setDoc, deleteDoc, updateDoc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let presenceUnsub = null, roomsUnsub = null;
let roomAF = null, roomT = 0;
let currentRoomId = null, myPresenceKey = null;
let timerInterval = null, timerSecs = 0, timerRunning = false;
let roomMode = "pomodoro"; // "pomodoro" | "unlimited" | "forever"
let sessionInterval = null, sessionElapsed = 0;

const AURA_COLORS = [
  "#00f5a0","#00d9f5","#7800ff","#f97316",
  "#ec4899","#f59e0b","#06b6d4","#a78bfa"
];
const STATUS_MSGS = [
  "Silence is the productivity.",
  "Others are working beside you.",
  "You are not alone in this.",
  "Discipline is freedom.",
  "The work you do now matters.",
  "Focus is the new IQ.",
  "Small wins compound.",
  "Presence is the superpower.",
];

export function renderFocusRooms() {
  return `
<div class="fr-page" id="frPage">

  <!-- LOBBY -->
  <div class="fr-lobby" id="frLobby">
    <div class="fr-lobby-top">
      <div>
        <h1 class="fr-lobby-h1">Focus Rooms</h1>
        <p class="fr-lobby-sub">Work alongside others in silence. No chat. Just presence.</p>
      </div>
      <button class="fr-create-btn" id="frCreateBtn">+ New Room</button>
    </div>
    <div class="fr-rooms-grid" id="frRoomsGrid">
      <div class="dash-loading">Loading rooms…</div>
    </div>
  </div>

  <!-- CREATE MODAL -->
  <div class="task-modal-overlay" id="frCreateModal" style="display:none">
    <div class="task-modal">
      <div class="modal-header">
        <h2>New Focus Room</h2>
        <button class="modal-close-btn" id="frCloseCreate">&times;</button>
      </div>
      <div class="form-group">
        <label>Room Name</label>
        <input type="text" id="frRoomName" placeholder="Deep Work, Study Hall, Ship It…" autocomplete="off">
      </div>
      <div class="form-group">
        <label>Mode</label>
        <div class="fr-mode-toggle" id="frModeToggle">
          <button class="fr-mode-btn active" data-mode="pomodoro">⏱ Pomodoro</button>
          <button class="fr-mode-btn" data-mode="unlimited">🕐 Session</button>
          <button class="fr-mode-btn" data-mode="forever">∞ Forever</button>
        </div>
        <div class="fr-mode-desc" id="frModeDesc">Classic Pomodoro — set time, then break.</div>
      </div>
      <div id="frDurationWrap" class="form-group">
        <label>Duration</label>
        <select id="frDuration">
          <option value="25">25 min — Classic</option>
          <option value="50">50 min — Deep Work</option>
          <option value="90">90 min — Flow State</option>
        </select>
      </div>
      <div class="form-group">
        <label>Access</label>
        <div class="fr-access-toggle" id="frAccessToggle">
          <button class="fr-access-btn active" data-access="open">🌐 Open</button>
          <button class="fr-access-btn" data-access="passkey">🔑 Passkey</button>
        </div>
      </div>
      <div id="frPasskeyWrap" class="form-group" style="display:none">
        <label>Passkey <span style="opacity:.5;font-weight:400">(share with people you invite)</span></label>
        <input type="text" id="frPasskeyInput" placeholder="e.g. aurora123" autocomplete="off">
      </div>
      <div class="modal-actions">
        <button class="primary-btn" id="frConfirmCreate">Create Room</button>
        <button class="ghost-btn"   id="frCancelCreate">Cancel</button>
      </div>
    </div>
  </div>

  <!-- PASSKEY ENTRY MODAL -->
  <div class="task-modal-overlay" id="frPasskeyModal" style="display:none">
    <div class="task-modal" style="max-width:360px">
      <div class="modal-header">
        <h2>🔑 Enter Passkey</h2>
        <button class="modal-close-btn" id="frClosePasskey">&times;</button>
      </div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">This room requires a passkey to join.</p>
      <div class="form-group">
        <label>Passkey</label>
        <input type="text" id="frPasskeyEntry" placeholder="Enter passkey…" autocomplete="off">
      </div>
      <p id="frPasskeyError" style="font-size:12px;color:#ef4444;display:none;margin-top:-8px">Incorrect passkey. Try again.</p>
      <div class="modal-actions">
        <button class="primary-btn" id="frConfirmPasskey">Join Room</button>
        <button class="ghost-btn"   id="frCancelPasskey">Cancel</button>
      </div>
    </div>
  </div>

  <!-- ROOM VIEW (full-screen) -->
  <div class="fr-room" id="frRoom" style="display:none">
    <canvas class="fr-aurora" id="frAurora"></canvas>

    <!-- Top bar -->
    <div class="fr-room-topbar">
      <div class="fr-room-name-label" id="frRoomLabel"></div>
      <div class="fr-room-badge" id="frRoomBadge"></div>
      <div class="fr-room-topbar-actions">
        <button class="fr-fullscreen-btn" id="frFullscreenBtn" title="Fullscreen">⛶</button>
        <button class="fr-topbar-btn fr-danger" id="frDeleteRoom" style="display:none" title="Delete room">🗑 Delete</button>
        <button class="fr-topbar-btn" id="frLeaveBtn">← Leave</button>
      </div>
    </div>

    <!-- Center: Timer -->
    <div class="fr-room-center">
      <div class="fr-timer-block">
        <div class="fr-timer" id="frTimerDisplay">00:00</div>
        <div class="fr-timer-sub" id="frTimerSub">Ready to start</div>
      </div>
      <div class="fr-room-controls" id="frRoomControls">
        <button class="fr-ctrl secondary" id="frResetBtn">↺ Reset</button>
        <button class="fr-ctrl primary"   id="frStartBtn">▶ Start</button>
        <button class="fr-ctrl secondary" id="frPauseBtn" style="display:none">⏸ Pause</button>
      </div>
    </div>

    <!-- Aura field: floating member orbs -->
    <div class="fr-aura-field" id="frAuraField"></div>

    <!-- Members sidebar -->
    <div class="fr-members-panel" id="frMembersPanel">
      <div class="fr-members-title">In Room</div>
      <div class="fr-members-list" id="frMembersList"></div>
    </div>

    <!-- Bottom status -->
    <div class="fr-room-bottom">
      <div class="fr-status-msg" id="frStatusMsg">Silence is the productivity.</div>
    </div>
  </div>
</div>`;
}

export async function initFocusRooms() {
  listenToRooms();
  setupLobbyEvents();
}

export function destroyFocusRooms() {
  if (presenceUnsub) presenceUnsub();
  if (roomsUnsub) roomsUnsub();
  clearInterval(timerInterval);
  clearInterval(sessionInterval);
  cancelAnimationFrame(roomAF);
  if (currentRoomId && myPresenceKey) removePresence();
}

/* ── ROOMS LIST ── */
function listenToRooms() {
  if (roomsUnsub) roomsUnsub();
  roomsUnsub = onSnapshot(collection(db, "focusRooms"), snap => {
    const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Forever rooms: auto-delete if no presence
    rooms.filter(r => r.mode === "forever").forEach(r => checkForeverRoom(r.id));
    renderRooms(rooms);
  });
}

async function checkForeverRoom(roomId) {
  const pSnap = await getDocs(collection(db, "focusRooms", roomId, "presence"));
  if (pSnap.empty) {
    try { await deleteDoc(doc(db, "focusRooms", roomId)); } catch(e){}
  }
}

function renderRooms(rooms) {
  const grid = document.getElementById("frRoomsGrid"); if (!grid) return;
  const me = auth.currentUser?.uid;
  if (!rooms.length) {
    grid.innerHTML = `<div class="fr-no-rooms"><div class="fr-no-rooms-icon">🌌</div><p>No rooms open. Be the first to create one.</p></div>`;
    return;
  }
  grid.innerHTML = rooms.map(r => {
    const modeLabel = r.mode === "forever" ? "∞ Forever" : r.mode === "unlimited" ? "🕐 Session" : `⏱ ${r.duration}m`;
    const lockIcon  = r.passkey ? "🔑 " : "";
    const isOwner   = r.createdBy === me;
    return `
    <div class="fr-room-card">
      <div class="fr-room-card-glow"></div>
      <div class="fr-room-card-body">
        <div class="fr-room-card-header">
          <span class="fr-room-card-name">${lockIcon}${r.name}</span>
          <span class="fr-room-card-mode">${modeLabel}</span>
        </div>
        <div class="fr-room-card-meta">
          <span class="fr-room-card-members" id="frMC-${r.id}">… members</span>
          <span class="fr-room-card-dot">·</span>
          <span>${isOwner ? "Your room" : "Open to join"}</span>
        </div>
        <div class="fr-room-card-actions">
          <button class="fr-join-btn" data-roomid="${r.id}" data-mode="${r.mode||"pomodoro"}" data-dur="${r.duration||25}" data-passkey="${r.passkey||""}">
            ${r.passkey ? "🔑 Join" : "Join"}
          </button>
          ${isOwner ? `<button class="fr-del-card-btn" data-delroom="${r.id}">Delete</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");

  // Live member counts
  rooms.forEach(r => {
    onSnapshot(collection(db, "focusRooms", r.id, "presence"), snap => {
      const el = document.getElementById(`frMC-${r.id}`);
      if (el) el.textContent = `${snap.size} member${snap.size !== 1 ? "s" : ""}`;
    });
  });
}

/* ── LOBBY EVENTS ── */
let pendingJoinId = null, pendingJoinMode = null, pendingJoinDur = null;

function setupLobbyEvents() {
  document.getElementById("frCreateBtn").onclick = () => {
    document.getElementById("frRoomName").value = "";
    document.getElementById("frPasskeyInput").value = "";
    document.getElementById("frCreateModal").style.display = "flex";
  };
  ["frCloseCreate","frCancelCreate"].forEach(id =>
    document.getElementById(id).onclick = () => document.getElementById("frCreateModal").style.display = "none"
  );

  // Mode toggle
  const MODE_DESC = {
    pomodoro: "Classic Pomodoro — set time, then break.",
    unlimited: "Session timer — track how long you work. Pause anytime.",
    forever:  "Room stays open forever (until empty). No time limit."
  };
  document.querySelectorAll(".fr-mode-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".fr-mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const m = btn.dataset.mode;
      document.getElementById("frDurationWrap").style.display = m === "pomodoro" ? "flex" : "none";
      document.getElementById("frModeDesc").textContent = MODE_DESC[m] || "";
    };
  });

  // Access toggle
  document.querySelectorAll(".fr-access-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".fr-access-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("frPasskeyWrap").style.display =
        btn.dataset.access === "passkey" ? "flex" : "none";
    };
  });

  // Create
  document.getElementById("frConfirmCreate").onclick = async () => {
    const name = document.getElementById("frRoomName").value.trim(); if (!name) return;
    const mode = document.querySelector(".fr-mode-btn.active")?.dataset.mode || "pomodoro";
    const dur  = parseInt(document.getElementById("frDuration").value) || 25;
    const access = document.querySelector(".fr-access-btn.active")?.dataset.access || "open";
    const passkey = access === "passkey" ? document.getElementById("frPasskeyInput").value.trim() : "";
    const ref = await addDoc(collection(db, "focusRooms"), {
      name, mode, duration: dur, passkey,
      createdBy: auth.currentUser?.uid,
      createdAt: serverTimestamp()
    });
    document.getElementById("frCreateModal").style.display = "none";
    joinRoom(ref.id, mode, dur);
  };

  // Passkey modal
  document.getElementById("frClosePasskey").onclick = () => {
    document.getElementById("frPasskeyModal").style.display = "none";
    pendingJoinId = null;
  };
  document.getElementById("frCancelPasskey").onclick = () => {
    document.getElementById("frPasskeyModal").style.display = "none";
    pendingJoinId = null;
  };
  document.getElementById("frConfirmPasskey").onclick = async () => {
    const entered = document.getElementById("frPasskeyEntry").value.trim();
    const snap = await getDoc(doc(db, "focusRooms", pendingJoinId));
    const correct = snap.data()?.passkey;
    if (entered !== correct) {
      document.getElementById("frPasskeyError").style.display = "block"; return;
    }
    document.getElementById("frPasskeyModal").style.display = "none";
    document.getElementById("frPasskeyError").style.display = "none";
    joinRoom(pendingJoinId, pendingJoinMode, pendingJoinDur);
    pendingJoinId = null;
  };

  // Delegated clicks
  document.addEventListener("click", async e => {
    const joinBtn = e.target.closest(".fr-join-btn");
    if (joinBtn) {
      const rid   = joinBtn.dataset.roomid;
      const mode  = joinBtn.dataset.mode || "pomodoro";
      const dur   = parseInt(joinBtn.dataset.dur) || 25;
      const passkey = joinBtn.dataset.passkey;
      if (passkey) {
        pendingJoinId = rid; pendingJoinMode = mode; pendingJoinDur = dur;
        document.getElementById("frPasskeyEntry").value = "";
        document.getElementById("frPasskeyError").style.display = "none";
        document.getElementById("frPasskeyModal").style.display = "flex";
      } else {
        joinRoom(rid, mode, dur);
      }
      return;
    }
    const delBtn = e.target.closest("[data-delroom]");
    if (delBtn) {
      if (!confirm("Delete this room for everyone?")) return;
      await deleteDoc(doc(db, "focusRooms", delBtn.dataset.delroom));
    }
  });
}

/* ── JOIN ── */
async function joinRoom(roomId, mode, duration) {
  currentRoomId = roomId; roomMode = mode;
  const user  = auth.currentUser;
  const color = AURA_COLORS[Math.floor(Math.random() * AURA_COLORS.length)];
  const pRef  = doc(db, "focusRooms", roomId, "presence", user.uid);
  myPresenceKey = user.uid;
  sessionElapsed = 0;

  await setDoc(pRef, {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Anon",
    color, joinedAt: serverTimestamp(), elapsed: 0, active: true
  });

  const snap = await getDoc(doc(db, "focusRooms", roomId));
  const rd   = snap.data() || {};

  document.getElementById("frLobby").style.display = "none";
  document.getElementById("frRoom").style.display  = "flex";
  document.getElementById("frRoomLabel").textContent = rd.name || "Focus Room";

  // Mode badge
  const badgeEl = document.getElementById("frRoomBadge");
  badgeEl.textContent = mode === "forever" ? "∞ Forever" : mode === "unlimited" ? "🕐 Session" : `⏱ ${duration}m`;
  badgeEl.className = "fr-room-badge";

  // Timer init
  if (mode === "forever") {
    // No timer — just session clock
    document.getElementById("frRoomControls").style.display = "none";
    document.getElementById("frTimerSub").textContent = "Room is open — work freely.";
    startSessionClock(pRef);
  } else if (mode === "unlimited") {
    document.getElementById("frStartBtn").style.display = "none";
    document.getElementById("frPauseBtn").style.display = "none";
    document.getElementById("frResetBtn").textContent = "↺ Restart";
    document.getElementById("frTimerSub").textContent = "Session timer running…";
    startSessionClock(pRef);
  } else {
    timerSecs = duration * 60;
    updateRoomTimer();
  }

  // Show delete only for owner
  const delBtn = document.getElementById("frDeleteRoom");
  delBtn.style.display = rd.createdBy === user.uid ? "flex" : "none";

  startRoomAurora();

  presenceUnsub = onSnapshot(collection(db, "focusRooms", roomId, "presence"), snap => {
    const members = snap.docs.map(d => d.data());
    renderAuraField(members, user.uid);
    renderMembersList(members, user.uid);
  });

  setupRoomControls(roomId, mode, duration, pRef);
  rotateMsgs();
}

async function removePresence() {
  try { await deleteDoc(doc(db, "focusRooms", currentRoomId, "presence", myPresenceKey)); } catch(e){}
}

/* ── SESSION CLOCK ── */
function startSessionClock(pRef) {
  const startTime = Date.now();
  sessionInterval = setInterval(async () => {
    sessionElapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(sessionElapsed / 60), s = sessionElapsed % 60;
    const el = document.getElementById("frTimerDisplay");
    if (el) el.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    try { await updateDoc(pRef, { elapsed: sessionElapsed }); } catch(e){}
  }, 1000);
}

/* ── ROOM CONTROLS ── */
function setupRoomControls(roomId, mode, duration, pRef) {
  const startBtn   = document.getElementById("frStartBtn");
  const pauseBtn   = document.getElementById("frPauseBtn");
  const resetBtn   = document.getElementById("frResetBtn");
  const leaveBtn   = document.getElementById("frLeaveBtn");
  const deleteBtn  = document.getElementById("frDeleteRoom");
  const fsBtn      = document.getElementById("frFullscreenBtn");

  // Fullscreen for rooms
  if (fsBtn) {
    fsBtn.onclick = () => {
      const roomEl = document.getElementById("frRoom");
      if (!document.fullscreenElement) {
        roomEl?.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    };
    document.addEventListener("fullscreenchange", () => {
      if (fsBtn) fsBtn.textContent = document.fullscreenElement ? "✕" : "⛶";
    });
  }


  // Forever mode — no controls except leave/delete
  if (mode === "forever") {
    resetBtn.style.display = "none";
    leaveBtn.onclick  = handleLeave;
    deleteBtn.onclick = handleDelete;
    return;
  }

  // Unlimited session
  if (mode === "unlimited") {
    resetBtn.onclick = () => {
      clearInterval(sessionInterval);
      sessionElapsed = 0;
      document.getElementById("frTimerDisplay").textContent = "00:00";
      startSessionClock(pRef);
    };
    leaveBtn.onclick  = handleLeave;
    deleteBtn.onclick = handleDelete;
    return;
  }

  // Pomodoro
  startBtn.onclick = () => {
    if (timerRunning) return;
    timerRunning = true; startBtn.style.display = "none"; pauseBtn.style.display = "inline-flex";
    document.getElementById("frTimerSub").textContent = "Focusing…";
    timerInterval = setInterval(() => {
      timerSecs--;
      updateRoomTimer();
      if (timerSecs <= 0) {
        clearInterval(timerInterval); timerRunning = false;
        startBtn.style.display = "inline-flex"; pauseBtn.style.display = "none";
        document.getElementById("frTimerSub").textContent = "Session complete! 🎉";
        import("../auroraNotify.js").then(m => m.auroraNotify({
          title:"Session Complete", message:"Great work! Take a break.", type:"success"
        }));
      }
    }, 1000);
  };

  pauseBtn.onclick = () => {
    clearInterval(timerInterval); timerRunning = false;
    startBtn.style.display = "inline-flex"; pauseBtn.style.display = "none";
    document.getElementById("frTimerSub").textContent = "Paused";
  };

  resetBtn.onclick = () => {
    clearInterval(timerInterval); timerRunning = false;
    timerSecs = duration * 60; updateRoomTimer();
    startBtn.style.display = "inline-flex"; pauseBtn.style.display = "none";
    document.getElementById("frTimerSub").textContent = "Ready to start";
  };

  leaveBtn.onclick  = handleLeave;
  deleteBtn.onclick = handleDelete;
}

async function handleLeave() {
  clearInterval(timerInterval); clearInterval(sessionInterval);
  cancelAnimationFrame(roomAF);
  await removePresence();
  if (presenceUnsub) presenceUnsub();
  currentRoomId = null; timerRunning = false;
  document.getElementById("frRoom").style.display  = "none";
  document.getElementById("frLobby").style.display = "flex";
  document.getElementById("frRoomControls").style.display = "";
}

async function handleDelete() {
  if (!confirm("Delete this room for everyone?")) return;
  clearInterval(timerInterval); clearInterval(sessionInterval);
  cancelAnimationFrame(roomAF);
  await removePresence();
  try { await deleteDoc(doc(db, "focusRooms", currentRoomId)); } catch(e){}
  if (presenceUnsub) presenceUnsub();
  currentRoomId = null; timerRunning = false;
  document.getElementById("frRoom").style.display  = "none";
  document.getElementById("frLobby").style.display = "flex";
  document.getElementById("frRoomControls").style.display = "";
}

function updateRoomTimer() {
  const m = Math.floor(timerSecs / 60), s = timerSecs % 60;
  const el = document.getElementById("frTimerDisplay");
  if (el) el.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/* ── AURA FIELD ── */
function renderAuraField(members, myUid) {
  const field = document.getElementById("frAuraField"); if (!field) return;
  field.innerHTML = members.map(m => {
    const isMe = m.uid === myUid;
    const elapsed = m.elapsed || 0;
    const em = Math.floor(elapsed/60), es = elapsed%60;
    const timeStr = elapsed > 0 ? `${String(em).padStart(2,"0")}:${String(es).padStart(2,"0")}` : "";
    return `
    <div class="fr-aura-orb ${isMe ? "fr-aura-me" : ""}" style="--ac:${m.color||"#00f5a0"}">
      <div class="fr-orb-glow"></div>
      <div class="fr-orb-core">
        <span class="fr-orb-initial">${(m.name||"?")[0].toUpperCase()}</span>
      </div>
      <div class="fr-orb-info">
        <span class="fr-orb-name">${isMe ? "You" : (m.name||"Anon").slice(0,9)}</span>
        ${timeStr ? `<span class="fr-orb-time">${timeStr}</span>` : ""}
      </div>
    </div>`;
  }).join("");
}

function renderMembersList(members, myUid) {
  const list = document.getElementById("frMembersList"); if (!list) return;
  list.innerHTML = members.map(m => {
    const isMe = m.uid === myUid;
    const elapsed = m.elapsed || 0;
    const em = Math.floor(elapsed/60), es = elapsed%60;
    return `
    <div class="fr-member-row">
      <div class="fr-member-dot" style="background:${m.color||"#00f5a0"}"></div>
      <div class="fr-member-info">
        <span class="fr-member-name">${isMe ? "You (me)" : (m.name||"Anon").slice(0,12)}</span>
        ${elapsed > 0 ? `<span class="fr-member-elapsed">${String(em).padStart(2,"0")}:${String(es).padStart(2,"0")}</span>` : ""}
      </div>
    </div>`;
  }).join("");
}

/* ── AURORA BG ── */
function startRoomAurora() {
  const canvas = document.getElementById("frAurora"); if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  window.addEventListener("resize", resize);
  function draw() {
    ctx.fillStyle = "#02040e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    [[0.38,"rgba(0,245,160,0.13)",0.007],[0.50,"rgba(80,0,255,0.09)",0.010],[0.58,"rgba(0,200,255,0.07)",0.005]]
      .forEach(([yo,c,sp],i) => {
        for (let x = 0; x < canvas.width; x += 4) {
          const wy = Math.sin(x*0.0025 + roomT*sp + i*1.3)*70;
          const cy = canvas.height*yo + wy;
          const g  = ctx.createLinearGradient(0,cy-80,0,cy+80);
          g.addColorStop(0,"transparent"); g.addColorStop(0.5,c); g.addColorStop(1,"transparent");
          ctx.fillStyle = g; ctx.fillRect(x, cy-80, 4, 160);
        }
      });
    roomT++; roomAF = requestAnimationFrame(draw);
  }
  draw();
}

/* ── STATUS ROTATION ── */
function rotateMsgs() {
  let i = 0;
  setInterval(() => {
    const el = document.getElementById("frStatusMsg"); if (!el) return;
    el.style.opacity = "0";
    setTimeout(() => { el.textContent = STATUS_MSGS[i++ % STATUS_MSGS.length]; el.style.opacity = "1"; }, 400);
  }, 9000);
}
