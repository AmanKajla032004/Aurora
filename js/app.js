import { navigate } from "./router.js";
import { initAuthLogic } from "./views/authView.js";
import { listenToAuthState, logout } from "./firebase/authService.js";
import { startDeadlineReminder } from "./deadlineReminder.js";

const authLayer   = document.getElementById("authLayer");
const appContainer = document.getElementById("appContainer");
const ONE_MONTH   = 30 * 24 * 60 * 60 * 1000;

// ── Accent system ──────────────────────────────────
// Aurora colour tokens (accent only — work on both light and dark)
const ACCENTS = {
  green:  { vars: { "--accent":"#00c87a","--accent2":"#00d9f5","--accent-glow":"rgba(0,200,122,0.35)","--accent-subtle":"rgba(0,200,122,0.08)","--accent-border":"rgba(0,200,122,0.25)","--grad-accent":"linear-gradient(135deg,#00f5a0,#00d9f5)" } },
  blue:   { vars: { "--accent":"#38bdf8","--accent2":"#818cf8","--accent-glow":"rgba(56,189,248,0.35)","--accent-subtle":"rgba(56,189,248,0.08)","--accent-border":"rgba(56,189,248,0.25)","--grad-accent":"linear-gradient(135deg,#38bdf8,#818cf8)" } },
  purple: { vars: { "--accent":"#a78bfa","--accent2":"#f472b6","--accent-glow":"rgba(167,139,250,0.35)","--accent-subtle":"rgba(167,139,250,0.08)","--accent-border":"rgba(167,139,250,0.25)","--grad-accent":"linear-gradient(135deg,#a78bfa,#f472b6)" } },
  amber:  { vars: { "--accent":"#f59e0b","--accent2":"#f97316","--accent-glow":"rgba(245,158,11,0.35)","--accent-subtle":"rgba(245,158,11,0.08)","--accent-border":"rgba(245,158,11,0.25)","--grad-accent":"linear-gradient(135deg,#f59e0b,#f97316)" } },
  rose:   { vars: { "--accent":"#f43f5e","--accent2":"#fb923c","--accent-glow":"rgba(244,63,94,0.35)","--accent-subtle":"rgba(244,63,94,0.08)","--accent-border":"rgba(244,63,94,0.25)","--grad-accent":"linear-gradient(135deg,#f43f5e,#fb923c)" } },
};

// Full theme combos: bg palette + accent colour
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
  const root = document.documentElement;
  Object.entries(t.vars).forEach(([k,v]) => root.style.setProperty(k, v));
  localStorage.setItem("aurora_accent", key);
  document.querySelectorAll(".aap-swatch").forEach(s =>
    s.classList.toggle("active", s.dataset.accent === key));
}

function applyCombo(key) {
  const c = COMBOS[key];
  if (!c) return;
  const root = document.documentElement;
  // Apply dark/light mode
  document.body.classList.toggle("dark", c.dark);
  const icon = document.querySelector(".toggle-icon");
  if (icon) icon.textContent = c.dark ? "🌙" : "☀️";
  // Override bg/surface/text tokens
  root.style.setProperty("--bg",       c.bg);
  root.style.setProperty("--surface",  c.surface);
  root.style.setProperty("--surface2", c.surface2);
  root.style.setProperty("--sidebar",  c.sidebar);
  root.style.setProperty("--text",     c.text);
  root.style.setProperty("--text2",    c.text2);
  root.style.setProperty("--muted",    c.muted);
  // Apply matching accent
  applyAccent(c.accent);
  localStorage.setItem("aurora_combo", key);
  localStorage.setItem("aurora_dark",  c.dark ? "1" : "0");
  // Update combo buttons
  document.querySelectorAll(".combo-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.combo === key));
}

// ── Theme dark/light ──────────────────────────────
function applyTheme(dark) {
  document.body.classList.toggle("dark", dark);
  // Clear combo so bg tokens reset to CSS defaults
  document.documentElement.style.removeProperty("--bg");
  document.documentElement.style.removeProperty("--surface");
  document.documentElement.style.removeProperty("--surface2");
  document.documentElement.style.removeProperty("--text");
  document.documentElement.style.removeProperty("--text2");
  document.documentElement.style.removeProperty("--muted");
  localStorage.removeItem("aurora_combo");
  const icon = document.querySelector(".toggle-icon");
  if (icon) icon.textContent = dark ? "🌙" : "☀️";
}

// ── Mobile sidebar ────────────────────────────────
function setupMobileSidebar() {
  // Only do mobile setup once
  if (!document.getElementById("mobileMenuBtn")) {
    // Create hamburger and inject into topbar
    const btn = document.createElement("button");
    btn.className = "mobile-menu-btn"; btn.id = "mobileMenuBtn";
    btn.innerHTML = "☰"; btn.setAttribute("aria-label","Open menu");
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
  // Close when navigating
  document.addEventListener("click", e => {
    if ((e.target.dataset.route || e.target.closest("[data-route]")) && window.innerWidth <= 768) close();
  });
}

// ── Auth ──────────────────────────────────────────
initAuthLogic(() => localStorage.setItem("aurora_login_time", Date.now().toString()));

// onAuthStateChanged fires once with null while Firebase reads its session from IndexedDB.
// We must NOT show the login screen on that first null — only after Firebase has finished
// its initialization. We track this with a flag.
let _authResolved = false;

listenToAuthState(async user => {
  if (user) {
    _authResolved = true;

    // If we just registered and are showing the verify screen, don't enter app yet
    if (sessionStorage.getItem("aurora_pending_verify")) return;

    const t = parseInt(localStorage.getItem("aurora_login_time") || "0");
    if (t && (Date.now()-t) > ONE_MONTH) {
      localStorage.removeItem("aurora_login_time");
      await logout();
      return;
    }
    localStorage.setItem("aurora_login_time", Date.now().toString());

    // Restore theme FIRST — no flash of wrong theme
    const sc = localStorage.getItem("aurora_combo");
    if (sc) { applyCombo(sc); }
    else { applyTheme(localStorage.getItem("aurora_theme") === "dark"); applyAccent(localStorage.getItem("aurora_accent") || "green"); }

    authLayer.style.display    = "none";
    appContainer.style.display = "flex";

    // Navigate to last visited route (or home on first login)
    const lastRoute = localStorage.getItem("aurora_last_route") || "home";
    await navigate(lastRoute);
    startDeadlineReminder();

  } else {
    // Firebase fires null immediately on page load before checking its session.
    // Only show the login screen once Firebase confirms there is truly no session.
    // We do this by waiting a short tick — if user fires right after, we never see the null.
    if (!_authResolved) {
      // First null — Firebase still loading. Wait 1 second before giving up.
      await new Promise(r => setTimeout(r, 1000));
      // If still no user after 1 second, it's a genuine logged-out state.
      if (_authResolved) return; // user arrived in the meantime, do nothing
    }

    _authResolved = true;
    localStorage.removeItem("aurora_login_time");
    appContainer.style.display = "none";
    authLayer.style.display    = "block";
  }
});

// ── Global click handler ──────────────────────────
document.addEventListener("click", async e => {
  // Navigation
  if (e.target.dataset.route) { navigate(e.target.dataset.route); return; }

  // Logout
  if (e.target.id === "logoutBtn") { localStorage.removeItem("aurora_login_time"); await logout(); return; }

  // Theme toggle
  const toggle = e.target.closest("#themeToggle");
  if (toggle) {
    const dark = document.body.classList.toggle("dark");
    localStorage.setItem("aurora_theme", dark ? "dark" : "light");
    applyTheme(dark);
    return;
  }

  // Accent picker
  const swatch = e.target.closest(".aap-swatch");
  if (swatch) { applyAccent(swatch.dataset.accent); return; }

  // Combo theme picker
  const combo = e.target.closest(".combo-btn");
  if (combo) { applyCombo(combo.dataset.combo); return; }

  // Theme panel toggle button
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

// ── Boot ──────────────────────────────────────────
const savedCombo = localStorage.getItem("aurora_combo");
if (savedCombo) {
  applyCombo(savedCombo);
} else {
  const savedTheme = localStorage.getItem("aurora_theme");
  applyTheme(savedTheme === "dark");
  applyAccent(localStorage.getItem("aurora_accent") || "green");
}
setupMobileSidebar();