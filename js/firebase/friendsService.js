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
  const data = {
    publicEmail: user.email.toLowerCase(),
    displayName: user.displayName || defaultUsername,
    username: username || defaultUsername,
    uid: user.uid,
    updatedAt: serverTimestamp()
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

export async function findUserByUsername(username) {
  const raw   = username.trim().replace(/^@/, "");
  const uname = raw.toLowerCase();
  // Sanitized version: what setPublicProfile stores as defaultUsername
  const sanitized = uname.replace(/[^a-z0-9_]/g, "");

  // 1. Exact username match
  const q1 = query(collection(db, "users"), where("username", "==", uname));
  const snap1 = await getDocs(q1);
  if (!snap1.empty) return { uid: snap1.docs[0].id, ...snap1.docs[0].data() };

  // 2. Sanitized username match (handles dots/dashes in input)
  if (sanitized && sanitized !== uname) {
    const q2 = query(collection(db, "users"), where("username", "==", sanitized));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) return { uid: snap2.docs[0].id, ...snap2.docs[0].data() };
  }

  // 3. displayName match (older profiles without username field)
  const q3 = query(collection(db, "users"), where("displayName", "==", uname));
  const snap3 = await getDocs(q3);
  if (!snap3.empty) return { uid: snap3.docs[0].id, ...snap3.docs[0].data() };

  return null;
}

export async function findUserByEmail(email) {
  const addr = email.trim().toLowerCase();
  // Try publicEmail field (how it's stored)
  const q1 = query(collection(db, "users"), where("publicEmail", "==", addr));
  const snap1 = await getDocs(q1);
  if (!snap1.empty) return { uid: snap1.docs[0].id, ...snap1.docs[0].data() };
  // Fallback: email field (some early docs may use "email" not "publicEmail")
  const q2 = query(collection(db, "users"), where("email", "==", addr));
  const snap2 = await getDocs(q2);
  if (!snap2.empty) return { uid: snap2.docs[0].id, ...snap2.docs[0].data() };
  return null;
}

// For username login: look up the real email from a username
export async function lookupEmailByUsername(username) {
  const found = await findUserByUsername(username);
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
      !data.uid
    );
    if (needsPatch) {
      const { setDoc: sd } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
      await sd(doc(db, "users", user.uid), {
        publicEmail: user.email.toLowerCase(),
        username: data.username || defaultUsername,
        displayName: data.displayName || defaultUsername,
        uid: user.uid
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