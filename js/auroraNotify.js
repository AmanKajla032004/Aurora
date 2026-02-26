/* ===============================
   AURORA NOTIFICATION SYSTEM
   Same aesthetic as login screen
================================= */

let notifyCanvas, notifyCtx, notifyAnimFrame, notifyTime = 0;

export function auroraNotify({ title = "Aurora", message, type = "info", duration = 4000 }) {
  // Remove existing
  const existing = document.getElementById("aurora-notify-overlay");
  if (existing) existing.remove();
  if (notifyAnimFrame) cancelAnimationFrame(notifyAnimFrame);

  const overlay = document.createElement("div");
  overlay.id = "aurora-notify-overlay";
  overlay.className = "aurora-notify-overlay";
  overlay.innerHTML = `
    <canvas id="aurora-notify-canvas"></canvas>
    <div class="aurora-notify-box">
      <div class="aurora-notify-glow"></div>
      <div class="aurora-notify-icon">${getIcon(type)}</div>
      <div class="aurora-notify-title">${title}</div>
      <div class="aurora-notify-message">${message}</div>
      <button class="aurora-notify-close" id="auroraNotifyClose">&times;</button>
      <div class="aurora-notify-progress">
        <div class="aurora-notify-progress-bar" id="auroraNotifyBar"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Canvas aurora background
  notifyCanvas = document.getElementById("aurora-notify-canvas");
  notifyCtx    = notifyCanvas.getContext("2d");
  notifyTime   = 0;
  notifyCanvas.width  = 420;
  notifyCanvas.height = 220;
  drawNotifyAurora();

  // Fade in
  setTimeout(() => overlay.classList.add("aurora-notify-visible"), 10);

  // Progress bar
  const bar = document.getElementById("auroraNotifyBar");
  bar.style.transition = `width ${duration}ms linear`;
  setTimeout(() => bar.style.width = "0%", 50);

  // Auto close
  const timer = setTimeout(() => closeNotify(overlay), duration);

  document.getElementById("auroraNotifyClose").onclick = () => {
    clearTimeout(timer);
    closeNotify(overlay);
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      clearTimeout(timer);
      closeNotify(overlay);
    }
  };
}

function closeNotify(overlay) {
  if (notifyAnimFrame) cancelAnimationFrame(notifyAnimFrame);
  overlay.classList.remove("aurora-notify-visible");
  setTimeout(() => overlay.remove(), 500);
}

function drawNotifyAurora() {
  if (!notifyCtx || !notifyCanvas) return;
  const w = notifyCanvas.width;
  const h = notifyCanvas.height;

  notifyCtx.fillStyle = "#010108";
  notifyCtx.fillRect(0, 0, w, h);

  for (let i = 0; i < w; i += 4) {
    const wave = Math.sin(i * 0.015 + notifyTime * 0.012) * 40;
    const y    = h / 2 + wave;
    const grad = notifyCtx.createLinearGradient(0, y - 80, 0, y + 80);
    grad.addColorStop(0,   "transparent");
    grad.addColorStop(0.4, "rgba(0,255,195,0.35)");
    grad.addColorStop(0.7, "rgba(120,0,255,0.25)");
    grad.addColorStop(1,   "transparent");
    notifyCtx.fillStyle = grad;
    notifyCtx.fillRect(i, y - 80, 4, 160);
  }

  notifyTime++;
  notifyAnimFrame = requestAnimationFrame(drawNotifyAurora);
}

function getIcon(type) {
  const icons = {
    info:    "✦",
    success: "✓",
    warning: "⚠",
    error:   "✕"
  };
  return icons[type] || "✦";
}
