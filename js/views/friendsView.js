import {
  setPublicProfile, getMyProfile, findUserByEmail, sendFriendRequest,
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
          <label class="fr-avatar-upload-btn" id="avatarUploadLabel" title="Change profile photo">
            <span id="avatarUploadIcon">📷</span>
            <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
          </label>
        </div>
        <div class="fr-profile-info">
          <div class="fr-profile-name" id="myUsernameDisplay">Loading…</div>
          <div class="fr-profile-email" id="myEmailDisplay"></div>
        </div>
      </div>
    </div>

    <!-- Add friend -->
    <div class="friends-add-card">
      <div class="friends-add-row">
        <input type="email" id="friendEmailInput" placeholder="Friend's email address..." class="friends-email-input" autocomplete="off">
        <button id="friendAddBtn" class="friends-add-btn">Add Friend</button>
      </div>
      <div id="friendAddMsg" class="friends-add-msg" style="display:none"></div>
    </div>

    <!-- Incoming requests -->
    <div id="friendRequests" class="friends-section" style="display:none">
      <div class="friends-section-title">📬 Friend Requests</div>
      <div id="friendRequestsList"></div>
    </div>

    <!-- Friends list -->
    <div class="friends-section">
      <div class="friends-section-title">👥 My Friends</div>
      <div id="friendsList"><div class="friends-loading">Loading…</div></div>
    </div>

    <!-- Friend dashboard modal -->
    <div id="friendDashModal" class="friend-modal-overlay" style="display:none">
      <div class="friend-modal">
        <div class="friend-modal-header">
          <div class="fr-modal-av-wrap">
            <div class="fr-modal-avatar" id="friendModalAvatar">?</div>
          </div>
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

export async function initFriends() {
  await setPublicProfile().catch(() => {});
  await loadMyProfile();
  await loadRequests();
  await loadFriends();

  // Avatar upload — wire to the input, NOT the label
  const fileInput = document.getElementById("avatarFileInput");
  if (fileInput) fileInput.onchange = handleAvatarUpload;

  // Add friend
  document.getElementById("friendAddBtn").onclick = async () => {
    const input = document.getElementById("friendEmailInput");
    const msg   = document.getElementById("friendAddMsg");
    const email = input.value.trim().toLowerCase();
    if (!email) return;
    msg.style.display = "block";
    msg.style.color   = "var(--muted)";
    msg.textContent   = "Searching…";
    try {
      if (email === auth.currentUser?.email?.toLowerCase())
        throw new Error("That's your own email!");
      const user = await findUserByEmail(email);
      if (!user) throw new Error("No Aurora account found for that email.");
      await sendFriendRequest(user.uid);
      msg.style.color = "var(--accent)";
      msg.textContent = `✓ Friend request sent to ${user.displayName || email}`;
      input.value = "";
    } catch(e) {
      msg.style.color = "#ef4444";
      msg.textContent = `⚠ ${e.message}`;
    }
  };

  document.getElementById("friendEmailInput").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("friendAddBtn").click();
  });

  document.getElementById("friendModalClose").onclick = () => {
    document.getElementById("friendDashModal").style.display = "none";
  };
  document.getElementById("friendDashModal").onclick = e => {
    if (e.target === document.getElementById("friendDashModal"))
      document.getElementById("friendDashModal").style.display = "none";
  };
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
    // uploadProfilePhoto saves to Firestore internally (Storage or base64 fallback)
    const photoURL = await uploadProfilePhoto(file);

    // If it returned a Storage URL, also save to profile doc
    if (photoURL && !photoURL.startsWith("data:")) {
      await setPublicProfile(null, photoURL);
    }

    // Update avatar display
    const avatarEl = document.getElementById("myAvatar");
    applyAvatar(avatarEl, photoURL, auth.currentUser?.email?.split("@")[0]);

    showToastFr("Profile photo updated! ✓");
  } catch(err) {
    console.error("Photo upload error:", err);
    showToastFr("Upload failed: " + err.message, "error");
  }

  if (iconEl) iconEl.textContent = "📷";
  e.target.value = ""; // allow re-selecting same file
}

// ── Requests & friends ────────────────────────────────────────
async function loadRequests() {
  const reqs    = await getIncomingRequests().catch(() => []);
  const section = document.getElementById("friendRequests");
  const list    = document.getElementById("friendRequestsList");
  if (!reqs.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  list.innerHTML = reqs.map(r => `
    <div class="friend-request-item" data-id="${r.id}" data-from="${r.from}">
      <div class="friend-req-info">
        <div class="friend-req-name">${r.fromEmail?.split("@")[0] || "Someone"}</div>
        <div class="friend-req-email">${r.fromEmail || ""}</div>
      </div>
      <div class="friend-req-actions">
        <button class="friend-accept-btn" data-id="${r.id}" data-from="${r.from}">✓ Accept</button>
        <button class="friend-decline-btn" data-id="${r.id}">✕</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".friend-accept-btn").forEach(btn => {
    btn.onclick = async () => { await acceptRequest(btn.dataset.id, btn.dataset.from); await loadRequests(); await loadFriends(); };
  });
  list.querySelectorAll(".friend-decline-btn").forEach(btn => {
    btn.onclick = async () => { await declineRequest(btn.dataset.id); await loadRequests(); };
  });
}

async function loadFriends() {
  const list = document.getElementById("friendsList");
  list.innerHTML = `<div class="friends-loading">Loading…</div>`;
  const friends = await getFriends().catch(() => []);
  if (!friends.length) {
    list.innerHTML = `<div class="friends-empty">
      <div style="font-size:40px;margin-bottom:10px">👋</div>
      <div style="font-size:14px;color:var(--muted)">No friends yet — add one by email above</div>
    </div>`;
    return;
  }
  list.innerHTML = friends.map(f => `
    <div class="friend-card" data-uid="${f.uid}">
      <div class="friend-avatar" style="${f.photoURL ? `background-image:url(${f.photoURL});background-size:cover;background-position:center` : ""}">
        ${f.photoURL ? "" : (f.displayName || "?")[0].toUpperCase()}
      </div>
      <div class="friend-info">
        <div class="friend-name">${f.displayName || f.uid}</div>
        <div class="friend-email">${f.publicEmail || ""}</div>
      </div>
      <div class="friend-card-actions">
        <button class="friend-view-btn" data-uid="${f.uid}" data-name="${f.displayName||"Friend"}" data-email="${f.publicEmail||""}" data-photo="${f.photoURL||""}">View Progress</button>
        <button class="friend-remove-btn" data-uid="${f.uid}" title="Remove friend">✕</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".friend-view-btn").forEach(btn => {
    btn.onclick = () => openFriendDash(btn.dataset.uid, btn.dataset.name, btn.dataset.email, btn.dataset.photo);
  });
  list.querySelectorAll(".friend-remove-btn").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Remove this friend?")) return;
      await removeFriend(btn.dataset.uid);
      await loadFriends();
    };
  });
}

async function openFriendDash(uid, name, email, photoURL) {
  const modal = document.getElementById("friendDashModal");
  const body  = document.getElementById("friendModalBody");
  document.getElementById("friendModalName").textContent  = name;
  document.getElementById("friendModalEmail").textContent = email;
  applyAvatar(document.getElementById("friendModalAvatar"), photoURL, name);
  body.innerHTML = `<div class="friend-modal-loading">Loading ${name}'s dashboard…</div>`;
  modal.style.display = "flex";

  let tasks = [];
  try { tasks = await getFriendTasks(uid); }
  catch { body.innerHTML = `<div style="color:#ef4444;padding:20px">Could not load — they may have a private account</div>`; return; }

  const now     = new Date();
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const pending = tasks.filter(t => !t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length;
  const rate    = total ? Math.round(done / total * 100) : 0;
  const highPri = tasks.filter(t => !t.completed && (t.priority||0) >= 4).slice(0, 5);

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
      <div class="fdash-progress-label"><span>Overall progress</span><span>${rate}%</span></div>
      <div class="fdash-bar-track"><div class="fdash-bar-fill" style="width:${rate}%"></div></div>
    </div>
    ${recentDone.length ? `<div class="fdash-section">
      <div class="fdash-section-title">✓ Completed this week (${recentDone.length})</div>
      ${recentDone.slice(0,6).map(t => `<div class="fdash-task-row">
        <span class="fdash-task-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
        <span class="fdash-task-name">${t.title}</span>
      </div>`).join("")}
    </div>` : ""}
    ${highPri.length ? `<div class="fdash-section">
      <div class="fdash-section-title">🎯 High priority</div>
      ${highPri.map(t => `<div class="fdash-task-row">
        <span class="fdash-task-dot" style="background:${pColors[t.priority]||"#6b7280"}"></span>
        <span class="fdash-task-name">${t.title}</span>
      </div>`).join("")}
    </div>` : ""}
    ${!recentDone.length && !highPri.length ? `<div style="text-align:center;padding:24px;color:var(--muted);font-size:14px">No recent activity to show</div>` : ""}
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