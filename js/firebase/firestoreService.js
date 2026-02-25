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

function getUserTaskCollection() {
  const user = auth.currentUser;
  if (!user) throw new Error("User not logged in");
  return collection(db, "users", user.uid, "tasks");
}

export async function addTaskToCloud(task) {
  const tasksCollection = getUserTaskCollection();
  await addDoc(tasksCollection, {
    ...task,
    completed: false,
    createdAt: serverTimestamp(),
    completedAt: null
  });
}

export async function getTasksFromCloud() {
  const tasksCollection = getUserTaskCollection();
  const snapshot = await getDocs(tasksCollection);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteTaskFromCloud(id) {
  const user = auth.currentUser;
  await deleteDoc(doc(db, "users", user.uid, "tasks", id));
}

export async function completeTaskInCloud(id) {
  const user = auth.currentUser;
  await updateDoc(doc(db, "users", user.uid, "tasks", id), {
    completed: true,
    completedAt: serverTimestamp()
  });
}

export async function updateTaskInCloud(id, data) {
  const user = auth.currentUser;
  await updateDoc(doc(db, "users", user.uid, "tasks", id), data);
}
