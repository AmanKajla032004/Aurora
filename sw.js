// Aurora Planner — Service Worker
// Caches app shell for offline use

const CACHE = "aurora-v12";

// Core files to cache on install
const SHELL = [
  "/",
  "/index.html",
  "/css/theme.css",
  "/css/theme-accent.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/animations.css",
  "/css/fixes.css",
  "/css/aurora-ui.css",
  "/css/dashboard-fix.css",
  "/css/analytics-fix.css",
  "/css/mobile.css",
  "/css/final-overrides.css",
  "/js/app.js",
  "/js/router.js",
  "/js/gemini.js",
  "/js/colorPicker.js",
  "/js/auroraNotify.js",
  "/js/deadlineReminder.js",
  "/js/firebase/firebaseConfig.js",
  "/js/firebase/authService.js",
  "/js/firebase/firestoreService.js",
  "/js/firebase/friendsService.js",
  "/js/views/authView.js",
  "/js/views/homeView.js",
  "/js/views/dashboardView.js",
  "/js/views/tasksView.js",
  "/js/views/calendarView.js",
  "/js/views/analyticsView.js",
  "/js/views/reportView.js",
  "/js/views/swotView.js",
  "/js/views/brainstormView.js",
  "/js/views/focusMode.js",
  "/js/views/focusRooms.js",
  "/js/views/friendsView.js",
  "/js/views/wellbeingView.js",
  "/js/views/whisperView.js",
];

// Install — cache all shell files
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate — delete old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache
// Firebase/Gemini API calls always go to network
self.addEventListener("fetch", e => {
  const url = e.request.url;

  // Always use network for: Firebase, Gemini API, CDN scripts
  if (
    url.includes("firestore.googleapis.com") ||
    url.includes("firebase") ||
    url.includes("generativelanguage.googleapis.com") ||
    url.includes("gstatic.com") ||
    url.includes("cdn.jsdelivr.net") ||
    url.includes("firebasestorage")
  ) {
    return; // Let browser handle normally
  }

  // For app files: try network first, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache fresh copy
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});