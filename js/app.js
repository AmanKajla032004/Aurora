import { navigate } from "./router.js";
import { initAuthLogic } from "./views/authView.js";
import { listenToAuthState, logout } from "./firebase/authService.js";
import { authReady } from "./firebase/firebaseConfig.js";
import { startDeadlineReminder } from "./deadlineReminder.js";
import { ensurePublicProfile } from "./firebase/friendsService.js";

const authLayer    = document.getElementById("authLayer");
const appContainer = document.getElementById("appContainer");
const ONE_MONTH    = 30 * 24 * 60 * 60 * 1000;

// ── Accent tokens ─────────────────────────────────────────────
const ACCENTS = {
  green:  { vars: { "--accent":"#00c87a","--accent2":"#00d9f5","--accent-glow":"rgba(0,200,122,0.35)","--accent-subtle":"rgba(0,200,122,0.08)","--accent-border":"rgba(0,200,122,0.25)","--grad-accent":"linear-gradient(135deg,#00f5a0,#00d9f5)" } },
  blue:   { vars: { "--accent":"#38bdf8","--accent2":"#818cf8","--accent-glow":"rgba(56,189,248,0.35)","--accent-subtle":"rgba(56,189,248,0.08)","--accent-border":"rgba(56,189,248,0.25)","--grad-accent":"linear-gradient(135deg,#38bdf8,#818cf8)" } },
  purple: { vars: { "--accent":"#a78bfa","--accent2":"#f472b6","--accent-glow":"rgba(167,139,250,0.35)","--accent-subtle":"rgba(167,139,250,0.08)","--accent-border":"rgba(167,139,250,0.25)","--grad-accent":"linear-gradient(135deg,#a78bfa,#f472b6)" } },
  amber:  { vars: { "--accent":"#f59e0b","--accent2":"#f97316","--accent-glow":"rgba(245,158,11,0.35)","--accent-subtle":"rgba(245,158,11,0.08)","--accent-border":"rgba(245,158,11,0.25)","--grad-accent":"linear-gradient(135deg,#f59e0b,#f97316)" } },
  rose:   { vars: { "--accent":"#f43f5e","--accent2":"#fb923c","--accent-glow":"rgba(244,63,94,0.35)","--accent-subtle":"rgba(244,63,94,0.08)","--accent-border":"rgba(244,63,94,0.25)","--grad-accent":"linear-gradient(135deg,#f43f5e,#fb923c)" } },
};

// ── Theme combos ──────────────────────────────────────────────
const COMBOS = {
  aurora:   { dark:true,  bg:"#0a0e1a", surface:"#111827", surface2:"#1c2740", sidebar:"#060a14", text:"#e2e8f0", text2:"#94a3b8", muted:"#64748b", accent:"green"  },
  midnight: { dark:true,  bg:"#0d0d1a", surface:"#13132b", surface2:"#1a1a38", sidebar:"#08081a", text:"#e8e8ff", text2:"#9999cc", muted:"#6666aa", accent:"purple" },
  ocean:    { dark:true,  bg:"#071825", surface:"#0c2233", surface2:"#0e2d46", sidebar:"#040f18", text:"#ddeeff", text2:"#88bbdd", muted:"#5588aa", accent:"blue"   },
  ember:    { dark:true,  bg:"#1a0f07", surface:"#261507", surface2:"#321c08", sidebar:"#110a03", text:"#fff0e0", text2:"#ccaa80", muted:"#996655", accent:"amber"  },
  sakura:   { dark:false, bg:"#fff5f7", surface:"#ffffff", surface2:"#fff0f3", sidebar:"#2d1520", text:"#2d1520", text2:"#7d4a5a", muted:"#c08898", accent:"rose"   },
  slate:    { dark:false, bg:"#f1f5f9", surface:"#ffffff", surface2:"#f8fafc", sidebar:"#0f172a", text:"#1e293b", text2:"#475569", muted:"#94a3b8", accent:"blue"   },
  sand:     { dark:false, bg:"#faf5eb", surface:"#fffdf5", surface2:"#f5f0e0", sidebar:"#3d2e0a", text:"#3d2e0a", text2:"#7a5c2a", muted:"#b08a55", accent:"amber"  },
};

function applyAccent(key) {
  const t = ACCENTS[key] || ACCENTS.green;
  Object.entries(t.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  localStorage.setItem("aurora_accent", key);
  document.querySelectorAll(".aap-swatch").forEach(s =>
    s.classList.toggle("active", s.dataset.accent === key));
}

function applyCombo(key) {
  const c = COMBOS[key]; if (!c) return;
  const root = document.documentElement;
  document.body.classList.toggle("dark", c.dark);
  const icon = document.querySelector(".toggle-icon");
  if (icon) icon.textContent = c.dark ? "🌙" : "☀️";
  root.style.setProperty("--bg",       c.bg);
  root.style.setProperty("--surface",  c.surface);
  root.style.setProperty("--surface2", c.surface2);
  root.style.setProperty("--sidebar",  c.sidebar);
  root.style.setProperty("--text",     c.text);
  root.style.setProperty("--text2",    c.text2);
  root.style.setProperty("--muted",    c.muted);
  applyAccent(c.accent);
  localStorage.setItem("aurora_combo", key);
  localStorage.setItem("aurora_dark",  c.dark ? "1" : "0");
  document.querySelectorAll(".combo-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.combo === key));
}

function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  const root = document.documentElement;
  ["--bg","--surface","--surface2","--text","--text2","--muted"].forEach(p =>
    root.style.removeProperty(p));
  localStorage.removeItem("aurora_combo");
  const icon = document.querySelector(".toggle-icon");
  if (icon) icon.textContent = dark ? "🌙" : "☀️";
}

// ── Mobile sidebar ────────────────────────────────────────────
function setupMobileSidebar() {
  if (!document.getElementById("mobileMenuBtn")) {
    const btn = document.createElement("button");
    btn.className = "mobile-menu-btn"; btn.id = "mobileMenuBtn";
    btn.innerHTML = "☰"; btn.setAttribute("aria-label", "Open menu");
    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.insertBefore(btn, topbar.firstChild);
    else document.body.appendChild(btn);
  }
  if (!document.getElementById("sidebarOverlay")) {
    const ov = document.createElement("div");
    ov.className = "sidebar-overlay"; ov.id = "sidebarOverlay";
    document.body.appendChild(ov);
  }
  const sidebar = document.querySelector(".sidebar");
  const btn = document.getElementById("mobileMenuBtn");
  const ov  = document.getElementById("sidebarOverlay");
  const open  = () => { sidebar?.classList.add("mobile-open"); ov.classList.add("active"); btn.innerHTML = "✕"; };
  const close = () => { sidebar?.classList.remove("mobile-open"); ov.classList.remove("active"); btn.innerHTML = "☰"; };
  btn.onclick = () => sidebar?.classList.contains("mobile-open") ? close() : open();
  ov.onclick  = close;
  document.addEventListener("click", e => {
    if ((e.target.dataset.route || e.target.closest("[data-route]")) && window.innerWidth <= 768) close();
  });
}

// ── Auth ──────────────────────────────────────────────────────
// enterApp — the single function that transitions from auth screen to app.
// Called in two situations:
//   1. Page load: authReady resolved with a user (session restored from IndexedDB)
//   2. After login: onSuccess callback from authView
// In both cases it applies theme, shows the app, navigates, starts reminders.
async function enterApp(routeOverride) {
  // If still waiting on email verification, stay on auth screen
  if (sessionStorage.getItem("aurora_pending_verify")) return;

  // Session expiry check
  const t = parseInt(localStorage.getItem("aurora_login_time") || "0");
  if (t && (Date.now() - t) > ONE_MONTH) {
    localStorage.removeItem("aurora_login_time");
    await logout();
    return;
  }
  localStorage.setItem("aurora_login_time", Date.now().toString());

  // Apply saved theme before revealing app (prevents flash)
  const savedCombo = localStorage.getItem("aurora_combo");
  if (savedCombo) {
    applyCombo(savedCombo);
  } else {
    applyTheme(localStorage.getItem("aurora_theme") === "dark");
    applyAccent(localStorage.getItem("aurora_accent") || "green");
  }

  // Show app, hide auth
  authLayer.style.display    = "none";
  appContainer.style.display = "flex";

  // Navigate — either to login-supplied route, or last saved route, or home
  const target = routeOverride || localStorage.getItem("aurora_last_route") || "home";
  await navigate(target);

  startDeadlineReminder();

  // Ensure this user's /users/{uid} public profile doc exists and has correct email.
  // Runs silently in background — required for friend search to find this user.
  ensurePublicProfile().catch(() => {});
}

// ── Page-load auth check ──────────────────────────────────────
// authReady resolves after Firebase finishes reading its IndexedDB session.
// This covers both Pattern A (fast) and Pattern B (null-first-then-user).
authReady.then(async user => {
  // Hide the "checking session" spinner — we now know the auth state
  const overlay = document.getElementById("authCheckingOverlay");
  if (overlay) overlay.style.display = "none";

  if (user) {
    await enterApp();
  } else {
    // Truly not logged in — reveal auth screen with a smooth fade
    localStorage.removeItem("aurora_login_time");
    appContainer.style.display = "none";
    authLayer.style.display    = "block";
    // Fade in the auth screen (overlay was hiding it)
    authLayer.style.opacity    = "0";
    authLayer.style.transition = "opacity 0.3s ease";
    requestAnimationFrame(() => { authLayer.style.opacity = "1"; });
  }
});

// ── Post-login entry ──────────────────────────────────────────
// initAuthLogic receives enterApp as the onSuccess callback.
// When the user logs in, authView calls onSuccess() which calls enterApp("home"),
// navigating to home and triggering initHome() — fixing the "empty home after login" bug.
initAuthLogic(async () => {
  localStorage.setItem("aurora_login_time", Date.now().toString());
  await enterApp("home");
});

// ── Logout detection ──────────────────────────────────────────
// listenToAuthState watches for auth changes AFTER the initial page load.
// The null check + display guard ensures this only triggers when the user
// explicitly logs out (not during the normal null-then-user startup sequence).
let _appWasShown = false;
listenToAuthState(user => {
  if (appContainer.style.display === "flex") _appWasShown = true;
  if (!user && _appWasShown) {
    _appWasShown = false;
    localStorage.removeItem("aurora_login_time");
    appContainer.style.display = "none";
    authLayer.style.display    = "block";
  }
});

// ── Global click handler ──────────────────────────────────────
document.addEventListener("click", async e => {
  if (e.target.dataset.route) { navigate(e.target.dataset.route); return; }
  if (e.target.id === "logoutBtn") { localStorage.removeItem("aurora_login_time"); await logout(); return; }

  const toggle = e.target.closest("#themeToggle");
  if (toggle) {
    const dark = document.body.classList.toggle("dark");
    localStorage.setItem("aurora_theme", dark ? "dark" : "light");
    applyTheme(dark);
    return;
  }

  const swatch = e.target.closest(".aap-swatch");
  if (swatch) { applyAccent(swatch.dataset.accent); return; }

  const combo = e.target.closest(".combo-btn");
  if (combo) { applyCombo(combo.dataset.combo); return; }

  if (e.target.closest("#themeToggleBtn")) {
    const panel = document.getElementById("themePanel");
    const btn   = document.getElementById("themeToggleBtn");
    if (panel) {
      const open = panel.style.display === "none" || panel.style.display === "";
      panel.style.display = open ? "block" : "none";
      if (btn) btn.classList.toggle("active", open);
    }
    return;
  }
});

// ── Boot (apply theme before any content renders) ─────────────
const _savedCombo = localStorage.getItem("aurora_combo");
if (_savedCombo) {
  applyCombo(_savedCombo);
} else {
  applyTheme(localStorage.getItem("aurora_theme") === "dark");
  applyAccent(localStorage.getItem("aurora_accent") || "green");
}
setupMobileSidebar();

// No premature overlay fade-out here.
// The overlay is hidden precisely by authReady.then() above — either when
// a valid session is found (app opens) or when the 3s timeout confirms no session
// (login screen appears). This prevents the "refresh → sees login screen" flicker.