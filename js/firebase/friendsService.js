// ─── Friends Service ──────────────────────────────────────────
import { db, auth } from "./firebaseConfig.js";
import {
  collection, doc, getDoc, getDocs, addDoc, deleteDoc,
  updateDoc, query, where, orderBy, serverTimestamp, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Profile ───────────────────────────────────────────────────
export async function setPublicProfile(username, photoURL) {
  const user = auth.currentUser;
  if (!user) return;
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const defaultUsername = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
  const data = {
    publicEmail: user.email,
    displayName: user.displayName || defaultUsername,
    username: username || defaultUsername,
    uid: user.uid,
    updatedAt: serverTimestamp()
  };
  if (photoURL) data.photoURL = photoURL;
  await setDoc(doc(db, "users", user.uid), data, { merge: true });
}

export async function getMyProfile() {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? { uid: user.uid, ...snap.data() } : null;
}

export async function findUserByUsername(username) {
  const q = query(collection(db, "users"), where("username", "==", username.trim().toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function findUserByEmail(email) {
  const q = query(collection(db, "users"), where("publicEmail", "==", email.trim().toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── Online status ─────────────────────────────────────────────
export async function setOnlineStatus(online) {
  const user = auth.currentUser;
  if (!user) return;
  const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  await setDoc(doc(db, "users", user.uid), {
    online,
    showOnlineStatus: true,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

export async function setShowOnlineStatus(show) {
  const user = auth.currentUser;
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
  const me = auth.currentUser;
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
  const me = auth.currentUser;
  if (!me) return [];
  const snap = await getDocs(query(
    collection(db, "friendRequests"),
    where("to", "==", me.uid),
    where("status", "==", "pending")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function acceptRequest(reqId, fromUid) {
  const me = auth.currentUser;
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
  const me = auth.currentUser;
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
  const me = auth.currentUser;
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
  const me = auth.currentUser;
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
  const me = auth.currentUser;
  if (!me) return () => {};
  const id = chatId(me.uid, toUid);
  const q  = query(collection(db, "chats", id, "messages"), orderBy("createdAt", "asc"), limit(100));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function getUnreadCount(fromUid) {
  const me = auth.currentUser;
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
  const me = auth.currentUser;
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

// ── Profile Photo (Firebase Storage) ─────────────────────────
export async function uploadProfilePhoto(file) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");

  // Import Firebase Storage
  const { getStorage, ref, uploadBytes, getDownloadURL }
    = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");

  const { app } = await import("./firebaseConfig.js");
  const storage  = getStorage(app);
  const filePath = `profilePhotos/${user.uid}/avatar.jpg`;
  const storageRef = ref(storage, filePath);

  // Compress image before upload using canvas
  const compressed = await compressImage(file, 300, 300, 0.8);
  await uploadBytes(storageRef, compressed, { contentType: "image/jpeg" });
  const url = await getDownloadURL(storageRef);
  return url;
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