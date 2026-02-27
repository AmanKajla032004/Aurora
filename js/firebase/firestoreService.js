import { db, auth } from "./firebaseConfig.js";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Wait for Firebase Auth to fully resolve before making Firestore calls.
// onAuthStateChanged fires null first while reading from IndexedDB — this ensures
// we get the real user before trying to access their data.
function waitForUser() {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) { resolve(auth.currentUser); return; }
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (user) resolve(user);
      else reject(new Error("Not logged in"));
    });
  });
}

async function getUserTaskCollection() {
  const user = await waitForUser();
  return collection(db, "users", user.uid, "tasks");
}

export async function addTaskToCloud(task) {
  const tasksCollection = await getUserTaskCollection();
  await addDoc(tasksCollection, {
    ...task,
    completed: false,
    createdAt: serverTimestamp(),
    completedAt: null
  });
}

export async function getTasksFromCloud() {
  const tasksCollection = await getUserTaskCollection();
  const snapshot = await getDocs(tasksCollection);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteTaskFromCloud(id) {
  const user = await waitForUser();
  await deleteDoc(doc(db, "users", user.uid, "tasks", id));
}

export async function completeTaskInCloud(id) {
  const user = await waitForUser();
  await updateDoc(doc(db, "users", user.uid, "tasks", id), {
    completed: true,
    completedAt: serverTimestamp()
  });
}

export async function updateTaskInCloud(id, data) {
  const user = await waitForUser();
  await updateDoc(doc(db, "users", user.uid, "tasks", id), data);
}