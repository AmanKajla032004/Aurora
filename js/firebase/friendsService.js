// ─── Friends Service ──────────────────────────────────────────
import { db, auth, authReady } from "./firebaseConfig.js";
import {
  collection, doc, getDoc, getDocs, addDoc, deleteDoc,
  updateDoc, query, where, orderBy, serverTimestamp, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function waitForUser() {
  // Check currentUser first — covers post-login calls where authReady may be stale null
  if (auth.currentUser) return auth.currentUser;
  const user = await authReady;
  if (user) return user;
  if (auth.currentUser) return auth.currentUser;
  throw new Error("Not logged in");
}

// ── Profile ───────────────────────────────────────────────────
export async function setPublicProfile(username, photoURL) {
  const user = await waitForUser().catch(() => null);
  if (!user) return;
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const defaultUsername = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
  const resolvedUsername = (username || defaultUsername).toLowerCase().replace(/[^a-z0-9_]/g, "");
  const data = {
    publicEmail:   user.email.toLowerCase(),
    displayName:   user.displayName || resolvedUsername,
    username:      resolvedUsername,
    usernameLower: resolvedUsername,          // indexed field for case-insensitive search
    uid:           user.uid,
    updatedAt:     serverTimestamp()
  };
  if (photoURL) data.photoURL = photoURL;
  await setDoc(doc(db, "users", user.uid), data, { merge: true });
}

export async function getMyProfile() {
  const user = await waitForUser().catch(() => null);
  if (!user) return null;
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? { uid: user.uid, ...snap.data() } : null;
}

// ── Core user lookup ──────────────────────────────────────────
// Accepts either a username or an email address.
// Fires all relevant Firestore queries in parallel so a single
// slow or missing field never blocks the others.
// Returns the first matching user doc, or null.
export async function findUser(input) {
  const raw   = (input || "").trim();
  const lower = raw.toLowerCase().replace(/^@/, "");
  if (!lower) return null;

  if (lower.includes("@")) {
    // Email lookup — query publicEmail field
    const snap = await getDocs(
      query(collection(db, "users"), where("publicEmail", "==", lower))
    );
    if (!snap.empty) return { uid: snap.docs[0].id, ...snap.docs[0].data() };
  } else {
    // Username lookup — query usernameLower field (always lowercase, set on write)
    const snap = await getDocs(
      query(collection(db, "users"), where("usernameLower", "==", lower))
    );
    if (!snap.empty) return { uid: snap.docs[0].id, ...snap.docs[0].data() };
  }
  return null;
}

// Thin wrappers kept for call-site compatibility
export async function findUserByUsername(username) {
  return findUser(username);
}

export async function findUserByEmail(email) {
  return findUser(email);
}

// For username login: look up the real email from a username
export async function lookupEmailByUsername(username) {
  const found = await findUser(username);
  if (!found) return null;
  return found.publicEmail || found.email || null;
}

// Ensure the calling user's public profile doc exists (creates if missing)
export async function ensurePublicProfile() {
  const user = await waitForUser().catch(() => null);
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    // Create the profile doc if it doesn't exist yet
    await setPublicProfile(null, null);
  } else {
    // Patch any missing or incorrect fields on existing profile docs
    const data = snap.data();
    const defaultUsername = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
    const needsPatch = (
      !data.publicEmail ||
      data.publicEmail !== user.email.toLowerCase() ||
      !data.username ||
      !data.usernameLower ||
      !data.uid
    );
    if (needsPatch) {
      const resolvedUsername = (data.username || defaultUsername).toLowerCase().replace(/[^a-z0-9_]/g, "");
      const { setDoc: sd } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      await sd(doc(db, "users", user.uid), {
        publicEmail:   user.email.toLowerCase(),
        username:      resolvedUsername,
        usernameLower: resolvedUsername,
        displayName:   data.displayName || resolvedUsername,
        uid:           user.uid
      }, { merge: true });
    }
  }
}

// ── Online status ─────────────────────────────────────────────
export async function setOnlineStatus(online) {
  const user = await waitForUser().catch(() => null);
  if (!user) return;
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  await setDoc(doc(db, "users", user.uid), {
    online,
    showOnlineStatus: true,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

export async function setShowOnlineStatus(show) {
  const user = await waitForUser().catch(() => null);
  if (!user) return;
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  await setDoc(doc(db, "users", user.uid), { showOnlineStatus: show }, { merge: true });
}

// Returns unsubscribe fn; callback(online: bool, showStatus: bool)
export function listenToOnlineStatus(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) { callback(false, false); return; }
    const data = snap.data();
    callback(!!data.online, data.showOnlineStatus !== false);
  });
}

// ── Friend requests ───────────────────────────────────────────
export async function sendFriendRequest(toUid) {
  const me = await waitForUser();
  if (!me) throw new Error("Not logged in");
  if (toUid === me.uid) throw new Error("You can't add yourself!");

  const alreadyFriend = await getDoc(doc(db, "users", me.uid, "friends", toUid));
  if (alreadyFriend.exists()) throw new Error("Already friends!");

  const existing = await getDocs(query(
    collection(db, "friendRequests"),
    where("from", "==", me.uid),
    where("to", "==", toUid)
  ));
  if (!existing.empty) throw new Error("Request already sent");

  const myProfile = await getMyProfile();
  await addDoc(collection(db, "friendRequests"), {
    from: me.uid,
    fromEmail: me.email,
    fromUsername: myProfile?.username || me.email.split("@")[0],
    to: toUid,
    status: "pending",
    createdAt: serverTimestamp()
  });
}

export async function getIncomingRequests() {
  const me = await waitForUser().catch(() => null);
  if (!me) return [];
  const snap = await getDocs(query(
    collection(db, "friendRequests"),
    where("to", "==", me.uid),
    where("status", "==", "pending")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function acceptRequest(reqId, fromUid) {
  const me = await waitForUser().catch(() => null);
  if (!me) return;
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  await updateDoc(doc(db, "friendRequests", reqId), { status: "accepted" });
  await setDoc(doc(db, "users", me.uid, "friends", fromUid), { uid: fromUid, since: serverTimestamp() });
  await setDoc(doc(db, "users", fromUid, "friends", me.uid), { uid: me.uid, since: serverTimestamp() });
}

export async function declineRequest(reqId) {
  await deleteDoc(doc(db, "friendRequests", reqId));
}

export async function getFriends() {
  const me = await waitForUser().catch(() => null);
  if (!me) return [];
  const snap = await getDocs(collection(db, "users", me.uid, "friends"));
  const friends = [];
  for (const d of snap.docs) {
    const profileSnap = await getDoc(doc(db, "users", d.id));
    if (profileSnap.exists()) friends.push({ uid: d.id, ...profileSnap.data() });
  }
  return friends;
}

export async function removeFriend(friendUid) {
  const me = await waitForUser().catch(() => null);
  if (!me) return;
  await deleteDoc(doc(db, "users", me.uid, "friends", friendUid));
  await deleteDoc(doc(db, "users", friendUid, "friends", me.uid));
}

export async function getFriendTasks(friendUid) {
  const snap = await getDocs(collection(db, "users", friendUid, "tasks"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Private messaging ─────────────────────────────────────────
function chatId(a, b) { return [a, b].sort().join("_"); }

export async function sendMessage(toUid, text) {
  const me = await waitForUser().catch(() => null);
  if (!me || !text.trim()) return;
  const id = chatId(me.uid, toUid);
  const myProfile = await getMyProfile();
  await addDoc(collection(db, "chats", id, "messages"), {
    from: me.uid,
    fromUsername: myProfile?.username || me.email.split("@")[0],
    text: text.trim(),
    createdAt: serverTimestamp(),
    read: false
  });
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  await setDoc(doc(db, "chats", id), {
    participants: [me.uid, toUid],
    lastMessage: text.trim(),
    lastFrom: me.uid,
    lastAt: serverTimestamp()
  }, { merge: true });
}

export function listenToMessages(toUid, callback) {
  const me = auth.currentUser;  // sync ok — listenToMessages called after auth resolves
  if (!me) return () => {};
  const id = chatId(me.uid, toUid);
  const q  = query(collection(db, "chats", id, "messages"), orderBy("createdAt", "asc"), limit(100));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function getUnreadCount(fromUid) {
  const me = await waitForUser().catch(() => null);
  if (!me) return 0;
  const id   = chatId(me.uid, fromUid);
  const snap = await getDocs(query(
    collection(db, "chats", id, "messages"),
    where("from", "==", fromUid),
    where("read", "==", false)
  ));
  return snap.size;
}

export async function markMessagesRead(fromUid) {
  const me = await waitForUser().catch(() => null);
  if (!me) return;
  const id   = chatId(me.uid, fromUid);
  const snap = await getDocs(query(
    collection(db, "chats", id, "messages"),
    where("from", "==", fromUid),
    where("read", "==", false)
  ));
  if (snap.empty) return;
  const { writeBatch } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}

// ── Profile Photo ─────────────────────────────────────────────
// Tries Firebase Storage first; if unavailable falls back to base64 in Firestore
export async function uploadProfilePhoto(file) {
  const user = await waitForUser();
  if (!user) throw new Error("Not logged in");

  // Compress first (needed for both paths)
  const compressed = await compressImage(file, 300, 300, 0.82);

  // Try Firebase Storage
  try {
    const { getStorage, ref, uploadBytes, getDownloadURL }
      = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");
    const { app } = await import("./firebaseConfig.js");
    const storage    = getStorage(app);
    const filePath   = `profilePhotos/${user.uid}/avatar.jpg`;
    const storageRef = ref(storage, filePath);
    await uploadBytes(storageRef, compressed, { contentType: "image/jpeg" });
    const url = await getDownloadURL(storageRef);
    return url;
  } catch(storageErr) {
    console.warn("Storage unavailable, using base64 fallback:", storageErr.message);

    // Fallback: convert compressed blob to base64 data URL and store in Firestore
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(compressed);
    });

    // Store directly in Firestore user doc (works without Storage)
    const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await setDoc(doc(db, "users", user.uid), { photoURL: base64 }, { merge: true });
    return base64;
  }
}

export async function getPhotoURL(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().photoURL || null : null;
}

// Compress image to square thumbnail
function compressImage(file, maxW, maxH, quality) {
  return new Promise((resolve, reject) => {
    const img  = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Crop to square from center
      const size = Math.min(img.width, img.height);
      const sx = (img.width  - size) / 2;
      const sy = (img.height - size) / 2;
      canvas.width  = maxW;
      canvas.height = maxH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, size, size, 0, 0, maxW, maxH);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", quality);
    };
    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}