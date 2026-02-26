import {
  setPublicProfile, findUserByUsername, sendFriendRequest,
  getIncomingRequests, acceptRequest, declineRequest,
  getFriends, removeFriend, getFriendTasks, uploadProfilePhoto, getPhotoURL,
  sendMessage, listenToMessages, markMessagesRead, getUnreadCount,
  getMyProfile, setOnlineStatus, listenToOnlineStatus
} from "../firebase/friendsService.js";
import { auth } from "../firebase/firebaseConfig.js";

let unsubChat = null;
let currentFriendUid = null;
let onlineUnsubs = {};

export function renderFriends() {
  return `
<div class="fr-page">

  <!-- ── MY PROFILE CARD ─────────────────────────────── -->
  <div class="fr-my-card">
    <div class="fr-my-avatar-wrap">
      <div class="fr-my-avatar" id="myAvatar">?</div>
      <label class="fr-avatar-upload-btn" id="avatarUploadLabel" title="Change profile photo">
        📷
        <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
      </label>
    </div>
    <div class="fr-my-info">
      <div class="fr-my-username" id="myUsernameDisplay">loading…</div>
      <div class="fr-my-email" id="myEmailDisplay"></div>
    </div>
    <div class="fr-my-actions">
      <label class="fr-online-toggle">
        <input type="checkbox" id="onlineToggle" checked>
        <span class="fr-toggle-track"></span>
        <span class="fr-toggle-label">Show online</span>
      </label>
      <button id="editUsernameBtn" class="fr-edit-btn">✎ Change username</button>
    </div>
  </div>

  <!-- Username edit row (hidden by default) -->
  <div id="usernameEditRow" class="fr-username-edit-row" style="display:none">
    <input id="usernameInput" type="text" placeholder="new_username (letters, numbers, _)" maxlength="20" class="fr-text-input">
    <button id="saveUsernameBtn" class="fr-accent-btn">Save</button>
    <span id="usernameMsg" class="fr-small-msg"></span>
  </div>

  <!-- ── ADD FRIEND ──────────────────────────────────── -->
  <div class="fr-section-card">
    <div class="fr-section-title">➕ Add Friend by Username</div>
    <div class="fr-add-row">
      <input type="text" id="friendUsernameInput" placeholder="their_username" class="fr-text-input" autocomplete="off">
      <button id="friendAddBtn" class="fr-accent-btn">Send Request</button>
    </div>
    <div id="friendAddMsg" class="fr-small-msg" style="margin-top:8px"></div>
  </div>

  <!-- ── INCOMING REQUESTS ───────────────────────────── -->
  <div id="requestsSection" class="fr-section-card" style="display:none">
    <div class="fr-section-title">📬 Friend Requests</div>
    <div id="requestsList"></div>
  </div>

  <!-- ── FRIENDS LIST ────────────────────────────────── -->
  <div class="fr-section-card">
    <div class="fr-section-title">👥 My Friends</div>
    <div id="friendsList"><div class="fr-loading">Loading…</div></div>
  </div>

  <!-- ── FRIEND MODAL ────────────────────────────────── -->
  <div id="friendModal" class="fr-modal-overlay" style="display:none">
    <div class="fr-modal">
      <div class="fr-modal-header">
        <div class="fr-modal-user">
          <div class="fr-modal-avatar" id="modalAvatar"></div>
          <div>
            <div class="fr-modal-name" id="modalName"></div>
            <div class="fr-modal-status" id="modalStatus"></div>
          </div>
        </div>
        <div class="fr-modal-tabs">
          <button class="fr-tab active" id="tabStats">📊 Stats</button>
          <button class="fr-tab" id="tabChat">💬 Chat <span id="chatUnreadBadge" class="fr-badge" style="display:none"></span></button>
          <button class="fr-modal-close" id="modalClose">✕</button>
        </div>
      </div>

      <!-- Stats panel -->
      <div id="panelStats" class="fr-panel"></div>

      <!-- Chat panel -->
      <div id="panelChat" class="fr-panel fr-chat-panel" style="display:none">
        <div id="chatMessages" class="fr-chat-messages"></div>
        <div class="fr-chat-input-row">
          <input id="chatInput" type="text" placeholder="Message…" class="fr-chat-input" autocomplete="off">
          <button id="chatSendBtn" class="fr-accent-btn">Send</button>
        </div>
      </div>
    </div>
  </div>

</div>`;
}

export async function initFriends() {
  // Register/update own profile and set online
  await setPublicProfile();
  setOnlineStatus(true);
  window.addEventListener("beforeunload", () => setOnlineStatus(false));

  // Load my profile display
  await loadMyProfile();
  await loadRequests();
  await loadFriendsList();

  // Online toggle
  document.getElementById("onlineToggle").onchange = (e) => {
    setOnlineStatus(e.target.checked);
  };

  // Edit username
  document.getElementById("editUsernameBtn").onclick = () => {
    const row = document.getElementById("usernameEditRow");
    row.style.display = row.style.display === "none" ? "flex" : "none";
  };

  document.getElementById("saveUsernameBtn").onclick = saveUsername;
  document.getElementById("usernameInput").onkeydown = e => { if (e.key === "Enter") saveUsername(); };

  // Profile photo upload
  document.getElementById("avatarFileInput").onchange = handleAvatarUpload;

  // Add friend
  document.getElementById("friendAddBtn").onclick = addFriend;
  document.getElementById("friendUsernameInput").onkeydown = e => { if (e.key === "Enter") addFriend(); };

  // Modal close
  document.getElementById("modalClose").onclick = closeModal;
  document.getElementById("friendModal").onclick = e => {
    if (e.target === document.getElementById("friendModal")) closeModal();
  };

  // Tab switching
  document.getElementById("tabStats").onclick = () => switchTab("stats");
  document.getElementById("tabChat").onclick  = () => switchTab("chat");
}

// ── My profile ────────────────────────────────────────────────
async function loadMyProfile() {
  const profile  = await getMyProfile().catch(() => null);
  const username = profile?.username || auth.currentUser?.email?.split("@")[0] || "me";
  const email    = auth.currentUser?.email || "";
  document.getElementById("myUsernameDisplay").textContent = "@" + username;
  document.getElementById("myEmailDisplay").textContent    = email;
  const avatarEl = document.getElementById("myAvatar");
  if (profile?.photoURL) {
    avatarEl.style.backgroundImage = `url(${profile.photoURL})`;
    avatarEl.style.backgroundSize  = "cover";
    avatarEl.style.backgroundPosition = "center";
    avatarEl.textContent = "";
  } else {
    avatarEl.textContent = username[0].toUpperCase();
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToastFr("Photo must be under 5MB", "error"); return;
  }
  const label = document.getElementById("avatarUploadLabel");
  label.textContent = "⏳";
  try {
    const photoURL = await uploadProfilePhoto(file);
    await setPublicProfile(null, photoURL);
    const avatarEl = document.getElementById("myAvatar");
    avatarEl.style.backgroundImage = `url(${photoURL})`;
    avatarEl.style.backgroundSize  = "cover";
    avatarEl.style.backgroundPosition = "center";
    avatarEl.textContent = "";
    showToastFr("Profile photo updated! ✓");
  } catch(err) {
    showToastFr("Upload failed: " + err.message, "error");
  }
  label.textContent = "📷";
  label.appendChild(document.getElementById("avatarFileInput"));
}

function showToastFr(msg, type = "success") {
  const t = document.createElement("div");
  t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${type==="error"?"#ef4444":"var(--accent)"};color:${type==="error"?"#fff":"#000"};
    padding:10px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:9999;
    box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:fadeInUp 0.2s ease`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

async function saveUsername() {
  const raw = document.getElementById("usernameInput").value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const msg = document.getElementById("usernameMsg");
  if (!raw || raw.length < 3) { msg.textContent = "Min 3 chars (letters, numbers, _)"; msg.style.color = "#ef4444"; return; }
  msg.textContent = "Checking…"; msg.style.color = "var(--muted)";
  const existing = await findUserByUsername(raw);
  if (existing && existing.uid !== auth.currentUser.uid) {
    msg.textContent = "Username taken, try another."; msg.style.color = "#ef4444"; return;
  }
  await setPublicProfile(raw);
  document.getElementById("myUsernameDisplay").textContent = "@" + raw;
  document.getElementById("myAvatar").textContent = raw[0].toUpperCase();
  document.getElementById("usernameInput").value = "";
  document.getElementById("usernameEditRow").style.display = "none";
  msg.textContent = "";
}

// ── Add friend ────────────────────────────────────────────────
async function addFriend() {
  const input = document.getElementById("friendUsernameInput");
  const msg   = document.getElementById("friendAddMsg");
  const username = input.value.trim().toLowerCase().replace(/^@/, "");
  if (!username) return;

  msg.textContent = "Searching…"; msg.style.color = "var(--muted)";

  try {
    const myProfile = await getMyProfile();
    if (username === myProfile?.username) throw new Error("That's you!");

    const user = await findUserByUsername(username);
    if (!user) throw new Error(`No user found with username "@${username}"`);

    await sendFriendRequest(user.uid);
    msg.textContent = `✓ Request sent to @${user.username || username}!`;
    msg.style.color = "#00c87a";
    input.value = "";
  } catch(e) {
    msg.textContent = "⚠ " + e.message;
    msg.style.color = "#ef4444";
  }
}

// ── Requests ──────────────────────────────────────────────────
async function loadRequests() {
  const reqs    = await getIncomingRequests().catch(() => []);
  const section = document.getElementById("requestsSection");
  const list    = document.getElementById("requestsList");

  if (!reqs.length) { section.style.display = "none"; return; }
  section.style.display = "block";

  list.innerHTML = reqs.map(r => `
    <div class="fr-request-item">
      <div class="fr-req-avatar">${(r.fromUsername || r.fromEmail || "?")[0].toUpperCase()}</div>
      <div class="fr-req-info">
        <div class="fr-req-name">@${r.fromUsername || r.fromEmail?.split("@")[0] || "Someone"}</div>
        <div class="fr-req-email">${r.fromEmail || ""}</div>
      </div>
      <div class="fr-req-btns">
        <button class="fr-accept-btn" data-id="${r.id}" data-from="${r.from}">✓ Accept</button>
        <button class="fr-decline-btn" data-id="${r.id}">✕</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".fr-accept-btn").forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = "…";
      await acceptRequest(btn.dataset.id, btn.dataset.from);
      await loadRequests(); await loadFriendsList();
    };
  });
  list.querySelectorAll(".fr-decline-btn").forEach(btn => {
    btn.onclick = async () => {
      await declineRequest(btn.dataset.id);
      await loadRequests();
    };
  });
}

// ── Friends list ──────────────────────────────────────────────
async function loadFriendsList() {
  const list = document.getElementById("friendsList");
  list.innerHTML = `<div class="fr-loading">Loading…</div>`;

  // Clean up previous online listeners
  Object.values(onlineUnsubs).forEach(u => u());
  onlineUnsubs = {};

  const friends = await getFriends().catch(() => []);

  if (!friends.length) {
    list.innerHTML = `<div class="fr-empty">
      <div style="font-size:36px;margin-bottom:8px">👋</div>
      <div>No friends yet — add someone by username above</div>
    </div>`;
    return;
  }

  // Render friend cards
  list.innerHTML = friends.map(f => `
    <div class="fr-friend-card" id="fc-${f.uid}">
      <div class="fr-friend-avatar-wrap">
        <div class="fr-friend-avatar" style="${f.photoURL ? `background-image:url(${f.photoURL});background-size:cover;background-position:center` : ""}">
          ${f.photoURL ? "" : (f.username || f.displayName || "?")[0].toUpperCase()}
        </div>
        <span class="fr-online-dot" id="dot-${f.uid}" style="display:none"></span>
      </div>
      <div class="fr-friend-info">
        <div class="fr-friend-name">@${f.username || f.displayName || f.uid}</div>
        <div class="fr-friend-sub" id="sub-${f.uid}">offline</div>
      </div>
      <div class="fr-friend-actions">
        <button class="fr-open-btn" data-uid="${f.uid}" data-name="${f.username || f.displayName || "Friend"}" data-email="${f.publicEmail || ""}">
          View
          <span class="fr-badge" id="badge-${f.uid}" style="display:none"></span>
        </button>
        <button class="fr-remove-btn" data-uid="${f.uid}" title="Remove">✕</button>
      </div>
    </div>`).join("");

  // Wire buttons
  list.querySelectorAll(".fr-open-btn").forEach(btn => {
    btn.onclick = () => openFriendModal(btn.dataset.uid, btn.dataset.name, btn.dataset.email, btn.dataset.photo);
  });
  list.querySelectorAll(".fr-remove-btn").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Remove this friend?")) return;
      await removeFriend(btn.dataset.uid);
      await loadFriendsList();
    };
  });

  // Live online status + unread badges per friend
  for (const f of friends) {
    // Online status
    onlineUnsubs[f.uid] = listenToOnlineStatus(f.uid, (online, showStatus) => {
      const dot = document.getElementById(`dot-${f.uid}`);
      const sub = document.getElementById(`sub-${f.uid}`);
      if (!dot || !sub) return;
      if (!showStatus) {
        dot.style.display = "none";
        sub.textContent = "";
      } else if (online) {
        dot.style.display = "block";
        sub.textContent = "🟢 online";
        sub.style.color = "#00c87a";
      } else {
        dot.style.display = "none";
        sub.textContent = "offline";
        sub.style.color = "var(--muted)";
      }
    });

    // Unread badge
    getUnreadCount(f.uid).then(count => {
      const badge = document.getElementById(`badge-${f.uid}`);
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? "inline-flex" : "none";
      }
    });
  }
}

// ── Friend modal ──────────────────────────────────────────────
async function openFriendModal(uid, name, email, photoURL) {
  currentFriendUid = uid;
  document.getElementById("modalName").textContent = "@" + name;
  const mAv = document.getElementById("modalAvatar");
  if (photoURL) {
    mAv.style.backgroundImage    = `url(${photoURL})`;
    mAv.style.backgroundSize     = "cover";
    mAv.style.backgroundPosition = "center";
    mAv.textContent = "";
  } else {
    mAv.style.backgroundImage = "";
    mAv.textContent = name[0]?.toUpperCase() || "?";
  }
  document.getElementById("friendModal").style.display = "flex";
  document.getElementById("modalStatus").textContent = "";

  // Live online status in modal
  listenToOnlineStatus(uid, (online, showStatus) => {
    const el = document.getElementById("modalStatus");
    if (!el) return;
    if (!showStatus) { el.textContent = ""; return; }
    el.textContent = online ? "🟢 Online now" : "⚫ Offline";
    el.style.color = online ? "#00c87a" : "var(--muted)";
  });

  switchTab("stats");
  await loadFriendStats(uid);
  await markMessagesRead(uid);
  // Clear unread badge
  const badge = document.getElementById(`badge-${uid}`);
  if (badge) badge.style.display = "none";
  const chatBadge = document.getElementById("chatUnreadBadge");
  if (chatBadge) chatBadge.style.display = "none";
}

function closeModal() {
  document.getElementById("friendModal").style.display = "none";
  if (unsubChat) { unsubChat(); unsubChat = null; }
  currentFriendUid = null;
}

function switchTab(tab) {
  const showStats = tab === "stats";
  document.getElementById("panelStats").style.display = showStats ? "block" : "none";
  document.getElementById("panelChat").style.display  = showStats ? "none"  : "flex";
  document.getElementById("tabStats").classList.toggle("active", showStats);
  document.getElementById("tabChat").classList.toggle("active", !showStats);
  if (!showStats) openChat(currentFriendUid);
}

// ── Stats ─────────────────────────────────────────────────────
async function loadFriendStats(uid) {
  const panel = document.getElementById("panelStats");
  panel.innerHTML = `<div class="fr-loading">Loading stats…</div>`;

  let tasks = [];
  try { tasks = await getFriendTasks(uid); }
  catch {
    panel.innerHTML = `<div class="fr-empty" style="color:#ef4444">Could not load — private account</div>`;
    return;
  }

  const now     = new Date();
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const pending = tasks.filter(t => !t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length;
  const rate    = total ? Math.round(done / total * 100) : 0;

  const daySet = new Set(tasks.filter(t => t.completed && t.completedAt).map(t => {
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds * 1000 : t.completedAt);
    return d.toDateString();
  }));
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    if (daySet.has(d.toDateString())) streak++;
    else if (i > 0) break;
  }

  const weekAgo    = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const recentDone = tasks.filter(t => {
    if (!t.completed || !t.completedAt) return false;
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds * 1000 : t.completedAt);
    return d >= weekAgo;
  });
  const highPri = tasks.filter(t => !t.completed && (t.priority || 0) >= 4).slice(0, 5);
  const pColors = { 1:"#6b7280", 2:"#f59e0b", 3:"#f97316", 4:"#ef4444", 5:"#dc2626" };

  panel.innerHTML = `
    <div class="fr-stats-row">
      <div class="fr-stat"><div class="fr-stat-val">${total}</div><div class="fr-stat-lbl">Total</div></div>
      <div class="fr-stat"><div class="fr-stat-val" style="color:var(--accent)">${done}</div><div class="fr-stat-lbl">Done</div></div>
      <div class="fr-stat"><div class="fr-stat-val">${pending}</div><div class="fr-stat-lbl">Pending</div></div>
      <div class="fr-stat"><div class="fr-stat-val" style="color:${overdue?"#ef4444":"var(--accent)"}">${overdue}</div><div class="fr-stat-lbl">Overdue</div></div>
      <div class="fr-stat"><div class="fr-stat-val">${streak}🔥</div><div class="fr-stat-lbl">Streak</div></div>
      <div class="fr-stat"><div class="fr-stat-val">${rate}%</div><div class="fr-stat-lbl">Rate</div></div>
    </div>
    <div class="fr-progress-wrap">
      <div class="fr-progress-label"><span>Overall progress</span><span>${rate}%</span></div>
      <div class="fr-progress-track"><div class="fr-progress-fill" style="width:${rate}%"></div></div>
    </div>
    ${recentDone.length ? `
      <div class="fr-task-group">
        <div class="fr-task-group-title">✓ Completed this week (${recentDone.length})</div>
        ${recentDone.slice(0,6).map(t => `
          <div class="fr-task-row">
            <span class="fr-task-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
            <span>${esc(t.title)}</span>
          </div>`).join("")}
      </div>` : ""}
    ${highPri.length ? `
      <div class="fr-task-group">
        <div class="fr-task-group-title">🎯 High priority</div>
        ${highPri.map(t => `
          <div class="fr-task-row">
            <span class="fr-task-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
            <span>${esc(t.title)}</span>
          </div>`).join("")}
      </div>` : ""}
    ${!recentDone.length && !highPri.length ? `<div class="fr-empty">No recent activity</div>` : ""}
  `;
}

// ── Chat ──────────────────────────────────────────────────────
function openChat(friendUid) {
  if (!friendUid) return;
  if (unsubChat) { unsubChat(); unsubChat = null; }

  const msgs   = document.getElementById("chatMessages");
  const input  = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");

  msgs.innerHTML = `<div class="fr-loading">Loading…</div>`;

  unsubChat = listenToMessages(friendUid, (messages) => {
    const myUid = auth.currentUser?.uid;
    if (!messages.length) {
      msgs.innerHTML = `<div class="fr-chat-empty">No messages yet — say hello! 👋</div>`;
      return;
    }
    msgs.innerHTML = messages.map(m => {
      const isMe = m.from === myUid;
      const time = m.createdAt?.seconds
        ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})
        : "";
      return `<div class="fr-bubble-wrap ${isMe ? "fr-me" : "fr-them"}">
        <div class="fr-bubble">${esc(m.text)}</div>
        <div class="fr-bubble-time">${time}</div>
      </div>`;
    }).join("");
    msgs.scrollTop = msgs.scrollHeight;
    markMessagesRead(friendUid).catch(() => {});
  });

  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendBtn.disabled = true;
    try { await sendMessage(friendUid, text); }
    catch(e) { input.value = text; }
    sendBtn.disabled = false;
    input.focus();
  };

  sendBtn.onclick = doSend;
  input.onkeydown = e => { if (e.key === "Enter") doSend(); };
  setTimeout(() => input.focus(), 100);
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
