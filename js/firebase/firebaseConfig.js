import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC0bjEzbyPRQhRUuAClNWn0_x4fqF_GkWk",
  authDomain: "aurora-1c8c6.firebaseapp.com",
  projectId: "aurora-1c8c6",
  storageBucket: "aurora-1c8c6.firebasestorage.app",
  messagingSenderId: "491871370694",
  appId: "1:491871370694:web:6959da496d4fbf566fc6c7"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);