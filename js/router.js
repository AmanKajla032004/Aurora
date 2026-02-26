import { renderDashboard, initDashboard } from "./views/dashboardView.js";
import { renderTasks, initTasksLogic } from "./views/tasksView.js";
import { renderCalendar, initCalendar } from "./views/calendarView.js";
import { renderAnalytics, initAnalytics } from "./views/analyticsView.js";
import { renderBrainstorm, initBrainstormLogic } from "./views/brainstormView.js";
import { renderWhisper, initWhisperLogic, destroyWhisper } from "./views/whisperView.js";
import { renderHome, initHome } from "./views/homeView.js";
import { renderFocusMode, initFocusMode, destroyFocusMode } from "./views/focusMode.js";
import { renderFocusRooms, initFocusRooms, destroyFocusRooms } from "./views/focusRooms.js";
import { renderSwot, initSwotLogic } from "./views/swotView.js";
import { renderReport, initReport, checkAndGenerateMissedReports } from "./views/reportView.js";
import { renderFriends, initFriends } from "./views/friendsView.js";

export let currentRoute = "home";
let activeRoute = null;

// Run on every app load — silently generates missed reports in background
setTimeout(() => checkAndGenerateMissedReports(), 3000);

export async function navigate(route) {
  if (activeRoute === "whisper") destroyWhisper();
  if (activeRoute === "focus")   destroyFocusMode();
  if (activeRoute === "rooms")   destroyFocusRooms();

  currentRoute = route;
  activeRoute  = route;

  const content = document.getElementById("appContent");
  const title   = document.getElementById("pageTitle");

  document.querySelectorAll(".sidebar nav button").forEach(btn => {
    btn.classList.toggle("nav-active", btn.dataset.route === route);
  });

  content.style.opacity = "0";
  content.style.transform = "translateY(8px)";
  await new Promise(r => setTimeout(r, 80));
  content.style.transition = "opacity 0.18s ease, transform 0.18s ease";
  content.style.opacity = "1";
  content.style.transform = "translateY(0)";

  const routes = {
    home:       { title: "Home",          render: renderHome,        init: initHome },
    dashboard:  { title: "Dashboard",     render: renderDashboard,   init: initDashboard },
    tasks:      { title: "Tasks",         render: renderTasks,       init: initTasksLogic },
    calendar:   { title: "Calendar",      render: renderCalendar,    init: initCalendar },
    analytics:  { title: "Analytics",     render: renderAnalytics,   init: initAnalytics },
    brainstorm: { title: "Brainstorm",    render: renderBrainstorm,  init: initBrainstormLogic },
    whisper:    { title: "Whisper",       render: renderWhisper,     init: initWhisperLogic },
    focus:      { title: "Focus",         render: renderFocusMode,   init: initFocusMode },
    rooms:      { title: "Focus Rooms",   render: renderFocusRooms,  init: initFocusRooms },
    swot:       { title: "SWOT Analysis", render: renderSwot,        init: initSwotLogic },
    report:     { title: "Daily Report",  render: renderReport,      init: initReport },
    friends:    { title: "Friends",       render: renderFriends,     init: initFriends },
  };

  const r = routes[route];
  if (!r) return;

  title.textContent = r.title;
  content.innerHTML = typeof r.render === "function" ? (await r.render()) : r.render;
  setTimeout(() => r.init(), 50);
}