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

// Shared auth-ready promise — resolves with user (or null if genuinely logged out).
// Firebase fires onAuthStateChanged with null FIRST while reading IndexedDB,
// then fires with the real user. We wait for the DEFINITIVE answer:
//   - If we get a non-null user → resolve with that user
//   - If we get null after already getting null → truly logged out, resolve null
// All services import this instead of registering their own listeners.
let _authReadyResolve;
export const authReady = new Promise(res => { _authReadyResolve = res; });

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
let _firstFire = true;
onAuthStateChanged(auth, user => {
  if (user) {
    // Got a real user — definitely logged in
    _authReadyResolve(user);
    _firstFire = false;
  } else if (_firstFire) {
    // First null — Firebase still loading from IndexedDB, wait for next fire
    _firstFire = false;
    // Do NOT resolve yet — wait for the next onAuthStateChanged call
  } else {
    // Second+ null — genuinely logged out
    _authReadyResolve(null);
  }
});