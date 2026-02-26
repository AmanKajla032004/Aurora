import { getTasksFromCloud } from "./firebase/firestoreService.js";
import { auroraNotify } from "./auroraNotify.js";

const REMINDED = new Set(); // track already-fired reminders

export function startDeadlineReminder() {
  checkDeadlines();
  setInterval(checkDeadlines, 60 * 1000); // check every minute
}

async function checkDeadlines() {
  let tasks;
  try { tasks = await getTasksFromCloud(); } catch(e) { return; }

  const now = new Date();

  tasks.filter(t => !t.completed && t.dueDate).forEach(task => {
    const timeStr = task.dueTime || "23:59";
    const deadline = new Date(`${task.dueDate}T${timeStr}`);
    const diffMs   = deadline - now;
    const diffMin  = Math.round(diffMs / 60000);

    // Windows: 5min, 30min, 60min
    const windows = [
      { min: 5,  label: "5 minutes", key: `${task.id}-5`  },
      { min: 30, label: "30 minutes", key: `${task.id}-30` },
      { min: 60, label: "1 hour",     key: `${task.id}-60` },
    ];

    windows.forEach(({ min, label, key }) => {
      if (diffMin > 0 && diffMin <= min + 1 && diffMin >= min - 1 && !REMINDED.has(key)) {
        REMINDED.add(key);
        auroraNotify({
          title: "Deadline Approaching",
          message: `"${task.title}" is due in ${label}`,
          type: "warning",
          duration: 6000
        });
      }
    });

    // Overdue (fires once)
    const overdueKey = `${task.id}-overdue`;
    if (diffMin < 0 && diffMin > -2 && !REMINDED.has(overdueKey)) {
      REMINDED.add(overdueKey);
      auroraNotify({
        title: "Task Overdue",
        message: `"${task.title}" was due just now`,
        type: "error",
        duration: 8000
      });
    }
  });
}
