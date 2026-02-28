import { db, auth, authReady } from "./firebaseConfig.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// waitForUser — returns the authenticated user or throws.
//
// IMPORTANT: authReady is a ONE-SHOT promise that resolves at page load.
// If the user was not logged in at page load, authReady resolves to null and
// STAYS null — even after a subsequent login. So after login, we must check
// auth.currentUser directly instead of relying on the stale authReady value.
//
// Strategy:
//   1. If auth.currentUser is set right now → return it immediately (post-login path)
//   2. Else await authReady (page-load path — Firebase restoring session from IndexedDB)
//   3. After authReady, check auth.currentUser again (handles any remaining race)
//   4. If still null → throw
async function waitForUser() {
  // Fast path: already logged in (covers post-login calls)
  if (auth.currentUser) return auth.currentUser;

  // Slow path: wait for Firebase to restore session from IndexedDB on page load
  const user = await authReady;
  if (user) return user;

  // Final check: authReady may have resolved null during login timing gap
  if (auth.currentUser) return auth.currentUser;

  throw new Error("Not logged in");
}

async function getUserTaskCollection() {
  const user = await waitForUser();
  return collection(db, "users", user.uid, "tasks");
}

export async function addTaskToCloud(task) {
  const col = await getUserTaskCollection();
  const docRef = await addDoc(col, { ...task, createdAt: serverTimestamp() });
  return docRef.id;
}

export async function getTasksFromCloud() {
  const col = await getUserTaskCollection();
  const snapshot = await getDocs(col);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateTaskInCloud(taskId, updates) {
  const user = await waitForUser();
  const ref = doc(db, "users", user.uid, "tasks", taskId);
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

export async function completeTaskInCloud(taskId, completed = true) {
  const user = await waitForUser();
  const ref = doc(db, "users", user.uid, "tasks", taskId);
  await updateDoc(ref, {
    completed,
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp()
  });
}

export async function deleteTaskFromCloud(taskId) {
  const user = await waitForUser();
  const ref = doc(db, "users", user.uid, "tasks", taskId);
  await deleteDoc(ref);
}