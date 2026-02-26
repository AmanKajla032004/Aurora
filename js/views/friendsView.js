import {
  setPublicProfile, getMyProfile, findUserByEmail, findUserByUsername, sendFriendRequest,
  getIncomingRequests, acceptRequest, declineRequest,
  getFriends, removeFriend, getFriendTasks, uploadProfilePhoto
} from "../firebase/friendsService.js";
import { auth } from "../firebase/firebaseConfig.js";

export function renderFriends() {
  return `<div class="friends-page" id="friendsPage">

    <!-- My Profile Card -->
    <div class="fr-profile-card">
      <div class="fr-profile-left">
        <div class="fr-avatar-wrap">
          <div class="fr-avatar" id="myAvatar">?</div>
          <label class="fr-avatar-upload-btn" id="avatarUploadLabel" title="Change photo">
            <span id="avatarUploadIcon">📷</span>
            <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
          </label>
        </div>
        <div class="fr-profile-info">
          <div class="fr-profile-name-row">
            <div class="fr-profile-name" id="myUsernameDisplay">Loading…</div>
            <button class="fr-edit-btn" id="editUsernameBtn" title="Edit username">✎ Edit</button>
          </div>
          <div class="fr-profile-email" id="myEmailDisplay"></div>

          <!-- Inline username edit -->
          <div class="fr-username-edit-wrap" id="usernameEditWrap" style="display:none">
            <input type="text" id="usernameEditInput" class="fr-username-input"
              placeholder="new_username (letters, numbers, _)"
              maxlength="24" autocomplete="off" spellcheck="false">
            <div class="fr-username-edit-actions">
              <button class="fr-btn-save" id="usernameSaveBtn">Save</button>
              <button class="fr-btn-cancel" id="usernameCancelBtn">Cancel</button>
            </div>
            <div class="fr-username-rules">3–24 chars · letters, numbers, underscores only</div>
            <div class="fr-username-msg" id="usernameMsg"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Friend -->
    <div class="fr-add-card">
      <div class="fr-add-title">➕ Add a Friend</div>
      <div class="fr-search-tabs">
        <button class="fr-search-tab active" data-type="username">@ Username</button>
        <button class="fr-search-tab" data-type="email">✉ Email</button>
      </div>
      <div class="fr-add-row">
        <input type="text" id="friendSearchInput"
          placeholder="Enter @username…" class="fr-search-input" autocomplete="off">
        <button id="friendAddBtn" class="fr-add-btn">Send Request</button>
      </div>
      <div id="friendAddMsg" class="fr-add-msg" style="display:none"></div>
    </div>

    <!-- Incoming Requests -->
    <div id="friendRequests" class="fr-section" style="display:none">
      <div class="fr-section-title">📬 Friend Requests</div>
      <div id="friendRequestsList"></div>
    </div>

    <!-- Friends List -->
    <div class="fr-section">
      <div class="fr-section-title">👥 My Friends</div>
      <div id="friendsList"><div class="fr-loading">Loading…</div></div>
    </div>

    <!-- Friend Dashboard Modal -->
    <div id="friendDashModal" class="friend-modal-overlay" style="display:none">
      <div class="friend-modal">
        <div class="friend-modal-header">
          <div class="fr-modal-avatar" id="friendModalAvatar">?</div>
          <div style="flex:1">
            <div class="friend-modal-name" id="friendModalName"></div>
            <div class="friend-modal-email" id="friendModalEmail"></div>
          </div>
          <button id="friendModalClose" class="friend-modal-close">&times;</button>
        </div>
        <div id="friendModalBody" class="friend-modal-body"></div>
      </div>
    </div>
  </div>`;
}

let searchType = "username"; // or "email"

export async function initFriends() {
  await setPublicProfile().catch(() => {});
  await loadMyProfile();
  await loadRequests();
  await loadFriends();

  // Avatar upload
  const fileInput = document.getElementById("avatarFileInput");
  if (fileInput) fileInput.onchange = handleAvatarUpload;

  // ── Username edit ─────────────────────────────────────────
  document.getElementById("editUsernameBtn").onclick = () => {
    const wrap  = document.getElementById("usernameEditWrap");
    const input = document.getElementById("usernameEditInput");
    const cur   = document.getElementById("myUsernameDisplay").textContent.replace(/^@/, "");
    input.value = cur;
    wrap.style.display = "block";
    input.focus();
    input.select();
  };

  document.getElementById("usernameCancelBtn").onclick = () => {
    document.getElementById("usernameEditWrap").style.display = "none";
    document.getElementById("usernameMsg").textContent = "";
  };

  document.getElementById("usernameSaveBtn").onclick = async () => {
    const input = document.getElementById("usernameEditInput");
    const msg   = document.getElementById("usernameMsg");
    const raw   = input.value.trim().toLowerCase();

    // Validate
    if (!raw) { showUsernameMsg("Enter a username", "error"); return; }
    if (raw.length < 3) { showUsernameMsg("At least 3 characters", "error"); return; }
    if (!/^[a-z0-9_]+$/.test(raw)) { showUsernameMsg("Only letters, numbers, underscores", "error"); return; }

    const btn = document.getElementById("usernameSaveBtn");
    btn.disabled = true; btn.textContent = "Saving…";

    try {
      // Check if taken
      const existing = await findUserByUsername(raw);
      if (existing && existing.uid !== auth.currentUser?.uid) {
        showUsernameMsg("Username taken — try another", "error");
        btn.disabled = false; btn.textContent = "Save";
        return;
      }
      await setPublicProfile(raw, null);
      document.getElementById("myUsernameDisplay").textContent = "@" + raw;
      document.getElementById("usernameEditWrap").style.display = "none";
      showToastFr("Username updated to @" + raw + " ✓");
    } catch(e) {
      showUsernameMsg("Error: " + e.message, "error");
    }
    btn.disabled = false; btn.textContent = "Save";
  };

  document.getElementById("usernameEditInput").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("usernameSaveBtn").click();
    if (e.key === "Escape") document.getElementById("usernameCancelBtn").click();
  });

  // ── Search type tabs ───────────────────────────────────────
  document.querySelectorAll(".fr-search-tab").forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll(".fr-search-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      searchType = tab.dataset.type;
      const input = document.getElementById("friendSearchInput");
      input.value = "";
      input.placeholder = searchType === "username" ? "Enter @username…" : "Enter email address…";
      input.type = searchType === "email" ? "email" : "text";
    };
  });

  // ── Add friend ─────────────────────────────────────────────
  document.getElementById("friendAddBtn").onclick = doAddFriend;
  document.getElementById("friendSearchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") doAddFriend();
  });

  // ── Modal close ────────────────────────────────────────────
  document.getElementById("friendModalClose").onclick = () => {
    document.getElementById("friendDashModal").style.display = "none";
  };
  document.getElementById("friendDashModal").onclick = e => {
    if (e.target.id === "friendDashModal")
      document.getElementById("friendDashModal").style.display = "none";
  };
}

async function doAddFriend() {
  const input = document.getElementById("friendSearchInput");
  const msgEl = document.getElementById("friendAddMsg");
  const raw   = input.value.trim();
  if (!raw) return;

  msgEl.style.display = "block";
  showAddMsg("Searching…", "muted");

  try {
    const me = auth.currentUser;
    let found = null;

    if (searchType === "username") {
      const q = raw.replace(/^@/, "").toLowerCase();
      if (!q) throw new Error("Enter a username");
      if (q === (await getMyProfile().catch(()=>null))?.username)
        throw new Error("That's your own username!");
      found = await findUserByUsername(q);
      if (!found) throw new Error(`No Aurora user found with @${q}`);
    } else {
      const email = raw.toLowerCase();
      if (email === me?.email?.toLowerCase())
        throw new Error("That's your own email!");
      found = await findUserByEmail(email);
      if (!found) throw new Error("No Aurora account found for that email.");
    }

    await sendFriendRequest(found.uid);
    showAddMsg(`✓ Friend request sent to @${found.username || found.displayName || raw}`, "success");
    input.value = "";
  } catch(e) {
    showAddMsg("⚠ " + e.message, "error");
  }
}

function showAddMsg(text, type) {
  const el = document.getElementById("friendAddMsg");
  if (!el) return;
  el.style.display = "block";
  el.style.color = type === "success" ? "var(--accent)" : type === "error" ? "#ef4444" : "var(--muted)";
  el.textContent = text;
}

function showUsernameMsg(text, type) {
  const el = document.getElementById("usernameMsg");
  if (!el) return;
  el.textContent = text;
  el.style.color = type === "error" ? "#ef4444" : "var(--accent)";
}

// ── My profile ────────────────────────────────────────────────
async function loadMyProfile() {
  const profile  = await getMyProfile().catch(() => null);
  const username = profile?.username || auth.currentUser?.email?.split("@")[0] || "me";
  const email    = auth.currentUser?.email || "";

  document.getElementById("myUsernameDisplay").textContent = "@" + username;
  document.getElementById("myEmailDisplay").textContent    = email;

  const avatarEl = document.getElementById("myAvatar");
  applyAvatar(avatarEl, profile?.photoURL, username);
}

function applyAvatar(el, photoURL, fallbackName) {
  if (!el) return;
  if (photoURL) {
    el.style.backgroundImage    = `url(${photoURL})`;
    el.style.backgroundSize     = "cover";
    el.style.backgroundPosition = "center";
    el.textContent = "";
  } else {
    el.style.backgroundImage = "";
    el.textContent = (fallbackName || "?")[0].toUpperCase();
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToastFr("Photo must be under 5MB", "error"); return; }
  const iconEl = document.getElementById("avatarUploadIcon");
  if (iconEl) iconEl.textContent = "⏳";
  try {
    const photoURL = await uploadProfilePhoto(file);
    if (photoURL && !photoURL.startsWith("data:")) {
      await setPublicProfile(null, photoURL);
    }
    const avatarEl = document.getElementById("myAvatar");
    applyAvatar(avatarEl, photoURL, auth.currentUser?.email?.split("@")[0]);
    showToastFr("Profile photo updated ✓");
  } catch(err) {
    showToastFr("Upload failed: " + err.message, "error");
  }
  if (iconEl) iconEl.textContent = "📷";
  e.target.value = "";
}

// ── Requests ──────────────────────────────────────────────────
async function loadRequests() {
  const reqs    = await getIncomingRequests().catch(() => []);
  const section = document.getElementById("friendRequests");
  const list    = document.getElementById("friendRequestsList");
  if (!reqs.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  list.innerHTML = reqs.map(r => `
    <div class="fr-request-item" data-id="${r.id}">
      <div class="fr-req-info">
        <div class="fr-req-name">@${r.fromUsername || r.fromEmail?.split("@")[0] || "Someone"}</div>
        <div class="fr-req-email">${r.fromEmail || ""}</div>
      </div>
      <div class="fr-req-actions">
        <button class="fr-accept-btn" data-id="${r.id}" data-from="${r.from}">✓ Accept</button>
        <button class="fr-decline-btn" data-id="${r.id}">✕ Decline</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".fr-accept-btn").forEach(btn => {
    btn.onclick = async () => { await acceptRequest(btn.dataset.id, btn.dataset.from); await loadRequests(); await loadFriends(); };
  });
  list.querySelectorAll(".fr-decline-btn").forEach(btn => {
    btn.onclick = async () => { await declineRequest(btn.dataset.id); await loadRequests(); };
  });
}

// ── Friends list ──────────────────────────────────────────────
async function loadFriends() {
  const list = document.getElementById("friendsList");
  list.innerHTML = `<div class="fr-loading">Loading…</div>`;
  const friends = await getFriends().catch(() => []);
  if (!friends.length) {
    list.innerHTML = `<div class="fr-empty">
      <div style="font-size:40px;margin-bottom:12px">👋</div>
      <div>No friends yet — search by username or email above</div>
    </div>`;
    return;
  }
  list.innerHTML = friends.map(f => `
    <div class="fr-friend-card" data-uid="${f.uid}">
      <div class="fr-friend-av" style="${f.photoURL ? `background-image:url(${f.photoURL});background-size:cover;background-position:center` : ""}">
        ${f.photoURL ? "" : (f.username || f.displayName || "?")[0].toUpperCase()}
      </div>
      <div class="fr-friend-info">
        <div class="fr-friend-name">@${f.username || f.displayName || "friend"}</div>
        <div class="fr-friend-email">${f.publicEmail || ""}</div>
      </div>
      <div class="fr-friend-actions">
        <button class="fr-view-btn"
          data-uid="${f.uid}"
          data-name="${f.username || f.displayName || "Friend"}"
          data-email="${f.publicEmail || ""}"
          data-photo="${f.photoURL || ""}">View Stats</button>
        <button class="fr-remove-btn" data-uid="${f.uid}" title="Remove">✕</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".fr-view-btn").forEach(btn => {
    btn.onclick = () => openFriendDash(btn.dataset.uid, btn.dataset.name, btn.dataset.email, btn.dataset.photo);
  });
  list.querySelectorAll(".fr-remove-btn").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Remove this friend?")) return;
      await removeFriend(btn.dataset.uid);
      await loadFriends();
    };
  });
}

// ── Friend dashboard modal ────────────────────────────────────
async function openFriendDash(uid, name, email, photoURL) {
  const modal = document.getElementById("friendDashModal");
  const body  = document.getElementById("friendModalBody");
  document.getElementById("friendModalName").textContent  = "@" + name;
  document.getElementById("friendModalEmail").textContent = email;
  applyAvatar(document.getElementById("friendModalAvatar"), photoURL, name);
  body.innerHTML = `<div class="fr-modal-loading">Loading ${name}'s stats…</div>`;
  modal.style.display = "flex";

  let tasks = [];
  try { tasks = await getFriendTasks(uid); }
  catch { body.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center">Could not load — private account or error</div>`; return; }

  const now     = new Date();
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const pending = tasks.filter(t => !t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length;
  const rate    = total ? Math.round(done / total * 100) : 0;
  const highPri = tasks.filter(t => !t.completed && (t.priority||0) >= 4).slice(0, 5);

  const daySet  = new Set(tasks.filter(t => t.completed && t.completedAt).map(t => {
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    return d.toDateString();
  }));
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now); d.setDate(now.getDate()-i);
    if (daySet.has(d.toDateString())) streak++; else if (i > 0) break;
  }

  const weekAgo    = new Date(now); weekAgo.setDate(now.getDate()-7);
  const recentDone = tasks.filter(t => {
    if (!t.completed || !t.completedAt) return false;
    const d = new Date(t.completedAt.seconds ? t.completedAt.seconds*1000 : t.completedAt);
    return d >= weekAgo;
  });

  const pColors = { 1:"#6b7280", 2:"#f59e0b", 3:"#f97316", 4:"#ef4444", 5:"#dc2626" };

  body.innerHTML = `
    <div class="fdash-stats">
      <div class="fdash-stat"><div class="fdash-stat-val">${total}</div><div class="fdash-stat-lbl">Tasks</div></div>
      <div class="fdash-stat"><div class="fdash-stat-val" style="color:var(--accent)">${done}</div><div class="fdash-stat-lbl">Done</div></div>
      <div class="fdash-stat"><div class="fdash-stat-val">${pending}</div><div class="fdash-stat-lbl">Pending</div></div>
      <div class="fdash-stat"><div class="fdash-stat-val" style="color:${overdue?"#ef4444":"var(--accent)"}">
        ${overdue}</div><div class="fdash-stat-lbl">Overdue</div></div>
      <div class="fdash-stat"><div class="fdash-stat-val">${streak}🔥</div><div class="fdash-stat-lbl">Streak</div></div>
      <div class="fdash-stat"><div class="fdash-stat-val">${rate}%</div><div class="fdash-stat-lbl">Rate</div></div>
    </div>
    <div class="fdash-progress-wrap">
      <div class="fdash-progress-label"><span>Completion</span><span>${rate}%</span></div>
      <div class="fdash-bar-track"><div class="fdash-bar-fill" style="width:${rate}%"></div></div>
    </div>
    ${recentDone.length ? `<div class="fdash-section">
      <div class="fdash-section-title">✓ Done this week (${recentDone.length})</div>
      ${recentDone.slice(0,6).map(t => `<div class="fdash-task-row">
        <span class="fdash-task-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
        <span class="fdash-task-name">${t.title}</span>
      </div>`).join("")}
    </div>` : ""}
    ${highPri.length ? `<div class="fdash-section">
      <div class="fdash-section-title">🎯 High Priority Pending</div>
      ${highPri.map(t => `<div class="fdash-task-row">
        <span class="fdash-task-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
        <span class="fdash-task-name">${t.title}</span>
      </div>`).join("")}
    </div>` : ""}
    ${!recentDone.length && !highPri.length ? `<div style="text-align:center;padding:24px;color:var(--muted);font-size:14px">No recent activity</div>` : ""}
  `;
}

function showToastFr(msg, type = "success") {
  const t = document.createElement("div");
  t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${type==="error"?"#ef4444":"var(--accent)"};color:${type==="error"?"#fff":"#000"};
    padding:10px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:9999;
    box-shadow:0 4px 20px rgba(0,0,0,0.3)`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}