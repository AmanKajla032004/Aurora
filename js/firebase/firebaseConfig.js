import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }           from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore }      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyC0bjEzbyPRQhRUuAClNWn0_x4fqF_GkWk",
  authDomain:        "aurora-1c8c6.firebaseapp.com",
  projectId:         "aurora-1c8c6",
  storageBucket:     "aurora-1c8c6.firebasestorage.app",
  messagingSenderId: "491871370694",
  appId:             "1:491871370694:web:6959da496d4fbf566fc6c7"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ─────────────────────────────────────────────────────────────────
// authReady — resolves with the User if a session exists, null otherwise.
//
// Firebase fires onAuthStateChanged on every page load with two patterns:
//   Pattern A (cached token):   user fires immediately (< 200ms)
//   Pattern B (cold IndexedDB): null fires first, then user fires (100–900ms later)
//   Pattern C (no session):     null fires once, user never fires
//
// RULE: ignore all null fires. Only a user fire resolves this promise.
// A 5s hard timeout resolves null if no user ever arrives (Pattern C).
// ─────────────────────────────────────────────────────────────────
let _resolve;
let _resolved = false;

export const authReady = new Promise(res => { _resolve = res; });

function resolveOnce(val) {
  if (_resolved) return;
  _resolved = true;
  _resolve(val);
}

const _timeout = setTimeout(() => resolveOnce(null), 3000);

onAuthStateChanged(auth, user => {
  if (user) {
    clearTimeout(_timeout);
    resolveOnce(user);
  }
  // null: do nothing — wait for user fire or the 5s timeout
});