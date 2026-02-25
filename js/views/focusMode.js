import { getTasksFromCloud, completeTaskInCloud } from "../firebase/firestoreService.js";
import { showToast } from "./tasksView.js";

let focusCanvas, focusCtx, focusAF, focusT = 0;
let timerInterval = null, timerSecs = 25*60, timerRunning = false;
let currentTotal = 25*60, focusTaskId = null;
let audioCtx = null, audioNodes = [];
let currentSoundPreset = "none";

const MODES = { focus: 25*60, short: 5*60, long: 15*60 };

const SOUND_PRESETS = {
  none:      { label:"🔇 Off" },
  deep:      { label:"🌊 Deep Waves",  fn: buildDeepWaves   },
  rain:      { label:"🌧 Rain",        fn: buildRain        },
  forest:    { label:"🌿 Forest",      fn: buildForest      },
  cafe:      { label:"☕ Café Murmur", fn: buildCafe        },
  whitenoise:{ label:"📻 White Noise", fn: buildWhiteNoise  },
  binaural:  { label:"🧠 Binaural 40Hz",fn:buildBinaural   },
  lofi:      { label:"🎹 Lo-Fi Keys",  fn: buildLofi        },
  thunder:   { label:"⛈ Thunder",      fn: buildThunder     },
  fire:      { label:"🔥 Fireplace",   fn: buildFire        },
};

const QUOTES = [
  "Small wins compound into great achievements.",
  "Discipline > Motivation. Show up anyway.",
  "The work you do now is the story you tell later.",
  "One focused session changes everything.",
  "You're building momentum. Keep going.",
  "Consistency is the rarest and most valuable skill.",
  "Focus is the new IQ.",
  "Subtract the unnecessary. Add the essential.",
  "The present moment is where everything happens.",
  "Attention is the most precious resource you have.",
];

export function renderFocusMode() {
  const circ = (2 * Math.PI * 108).toFixed(1);
  return `
<div class="focus-wrap" id="focusWrap">
  <canvas id="focusAurora" class="focus-canvas"></canvas>
  <div class="focus-ui">

    <!-- Mode pills + top actions -->
    <div class="focus-toprow">
      <button class="focus-back" data-route="tasks">← Tasks</button>
      <div class="focus-mode-pills">
        <button class="focus-pill active" data-mode="focus">Focus 25m</button>
        <button class="focus-pill" data-mode="short">Break 5m</button>
        <button class="focus-pill" data-mode="long">Long 15m</button>
      </div>
      <div class="focus-top-actions">
        <button class="focus-top-btn" id="focusFullscreen" title="Fullscreen">⛶</button>
        <button class="focus-top-btn" id="focusQuoteToggle" title="Toggle quotes">💬</button>
      </div>
    </div>

    <!-- ── CENTER BLOCK: ring + controls + task + sound ── -->
    <div class="focus-center-block">

      <!-- Timer ring -->
      <div class="focus-ring-wrap">
        <svg class="focus-ring-svg" viewBox="0 0 240 240">
          <circle class="focus-ring-track" cx="120" cy="120" r="108"/>
          <circle class="focus-ring-prog" id="focusRingProg" cx="120" cy="120" r="108"
            stroke-dasharray="${circ}" stroke-dashoffset="0"/>
        </svg>
        <div class="focus-ring-inner">
          <div class="focus-time"  id="focusTime">25:00</div>
          <div class="focus-phase" id="focusPhase">Ready</div>
        </div>
      </div>

      <!-- Controls -->
      <div class="focus-controls">
        <button class="focus-btn-ghost" id="focusReset" title="Reset">↺</button>
        <button class="focus-btn-main"  id="focusStart">▶ Start</button>
        <button class="focus-btn-ghost" id="focusSkip"  title="Skip">⏭</button>
      </div>

      <!-- Task selector -->
      <div class="focus-task-row">
        <select class="focus-task-sel" id="focusTaskSel">
          <option value="">Choose a task to focus on…</option>
        </select>
        <button class="focus-done-btn" id="focusDoneBtn" style="display:none">✓ Done</button>
      </div>
      <div class="focus-task-title" id="focusTaskTitle"></div>

      <!-- Sound picker -->
      <div class="focus-sound-row">
        <span class="focus-sound-lbl">Ambient Sound</span>
        <div class="focus-sound-pills" id="focusSoundPills">
          ${Object.entries(SOUND_PRESETS).map(([k,v]) =>
            `<button class="focus-sound-pill${k==="none"?" active":""}" data-sound="${k}">${v.label}</button>`
          ).join("")}
        </div>
      </div>

    </div><!-- end focus-center-block -->

    <!-- ── BOTTOM: floating quote overlay ── -->
    <div class="focus-quote-overlay" id="focusQuoteOverlay">
      <div class="focus-quote-text" id="focusQuoteText">Small wins compound.</div>
      <div class="focus-quote-hint">Quotes — <button class="focus-quote-off-btn" id="focusQuoteOff">Turn off</button></div>
    </div>

    <!-- Quote off chip -->
    <div class="focus-quote-off-chip" id="focusQuoteOffChip" style="display:none">
      <button id="focusQuoteOn">💬 Quotes off — tap to re-enable</button>
    </div>

  </div>
</div>`;
}

export async function initFocusMode() {
  focusCanvas = document.getElementById("focusAurora");
  focusCtx    = focusCanvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  drawAurora();

  // Populate task selector
  const tasks = await getTasksFromCloud();
  const sel   = document.getElementById("focusTaskSel");
  const pLbl  = {1:"🟢",2:"🟡",3:"🟠",4:"🔴",5:"🔺"};
  tasks.filter(t => !t.completed)
       .sort((a,b) => (b.priority||0)-(a.priority||0))
       .forEach(t => sel.add(new Option(`${pLbl[t.priority]||"·"} ${t.title}`, t.id)));

  // Quote overlay — Whisper-style floating text
  let qi = 0, quotesOn = true, quoteTimer = null;

  const showQuote = () => {
    if (!quotesOn) return;
    const overlay = document.getElementById("focusQuoteOverlay");
    const textEl  = document.getElementById("focusQuoteText");
    if (!overlay || !textEl) return;
    textEl.style.opacity = "0";
    textEl.style.transform = "translateY(10px)";
    setTimeout(() => {
      textEl.textContent = QUOTES[qi++ % QUOTES.length];
      textEl.style.opacity = "1";
      textEl.style.transform = "translateY(0)";
    }, 300);
  };

  const startQuotes = () => { showQuote(); quoteTimer = setInterval(showQuote, 10000); };
  const stopQuotes  = () => { clearInterval(quoteTimer); };

  startQuotes();

  // Quote toggle
  document.getElementById("focusQuoteToggle")?.addEventListener("click", () => {
    quotesOn = !quotesOn;
    const overlay = document.getElementById("focusQuoteOverlay");
    const chip    = document.getElementById("focusQuoteOffChip");
    if (quotesOn) {
      overlay?.classList.remove("hidden");
      if (chip) chip.style.display = "none";
      startQuotes();
    } else {
      stopQuotes();
      overlay?.classList.add("hidden");
      if (chip) chip.style.display = "flex";
    }
  });

  document.getElementById("focusQuoteOff")?.addEventListener("click", () => {
    quotesOn = false; stopQuotes();
    document.getElementById("focusQuoteOverlay")?.classList.add("hidden");
    const chip = document.getElementById("focusQuoteOffChip");
    if (chip) chip.style.display = "flex";
  });

  document.getElementById("focusQuoteOn")?.addEventListener("click", () => {
    quotesOn = true;
    document.getElementById("focusQuoteOverlay")?.classList.remove("hidden");
    const chip = document.getElementById("focusQuoteOffChip");
    if (chip) chip.style.display = "none";
    startQuotes();
  });

  // Fullscreen
  document.getElementById("focusFullscreen")?.addEventListener("click", () => {
    const wrap = document.getElementById("focusWrap");
    if (!document.fullscreenElement) {
      wrap?.requestFullscreen().catch(() => {});
      document.getElementById("focusFullscreen").textContent = "⛶";
    } else {
      document.exitFullscreen();
      document.getElementById("focusFullscreen").textContent = "⛶";
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const btn = document.getElementById("focusFullscreen");
    if (btn) btn.textContent = document.fullscreenElement ? "✕" : "⛶";
  });

  updateDisplay(); updateRing(1);
  setupFocusEvents(tasks);
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
}

export function destroyFocusMode() {
  cancelAnimationFrame(focusAF);
  clearInterval(timerInterval);
  window.removeEventListener("resize", resizeCanvas);
  stopSound();
  timerRunning = false; timerSecs = 25*60;
}

/* ---- Canvas ---- */
function resizeCanvas() {
  if (!focusCanvas) return;
  focusCanvas.width  = window.innerWidth;
  focusCanvas.height = window.innerHeight;
}
function drawAurora() {
  if (!focusCtx || !focusCanvas) return;
  const w = focusCanvas.width, h = focusCanvas.height;
  focusCtx.fillStyle = "#02050f"; focusCtx.fillRect(0,0,w,h);
  const bands = [
    {c:"rgba(0,220,140,0.16)",  s:0.007, a:70,  yo:0.40},
    {c:"rgba(100,0,255,0.10)",  s:0.010, a:50,  yo:0.52},
    {c:"rgba(0,180,255,0.08)",  s:0.005, a:90,  yo:0.60},
  ];
  bands.forEach((b,bi) => {
    for (let x = 0; x < w; x += 4) {
      const wy = Math.sin(x*0.0025 + focusT*b.s + bi*1.4)*b.a;
      const cy = h*b.yo + wy;
      const g  = focusCtx.createLinearGradient(0,cy-90,0,cy+90);
      g.addColorStop(0,"transparent"); g.addColorStop(0.5,b.c); g.addColorStop(1,"transparent");
      focusCtx.fillStyle = g; focusCtx.fillRect(x, cy-90, 4, 180);
    }
  });
  focusT++; focusAF = requestAnimationFrame(drawAurora);
}

/* ---- Timer ---- */
function updateDisplay() {
  const m = Math.floor(timerSecs/60), s = timerSecs%60;
  const el = document.getElementById("focusTime");
  if (el) el.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function updateRing(pct) {
  const r = document.getElementById("focusRingProg"); if (!r) return;
  const c = 2 * Math.PI * 108;
  r.style.strokeDashoffset = `${c * (1 - Math.max(0, Math.min(1, pct)))}`;
}
function setPhase(txt) { const el = document.getElementById("focusPhase"); if (el) el.textContent = txt; }

/* ---- Sound builders ---- */
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function fadeGain(g, from, to, dur=2) {
  g.gain.setValueAtTime(from, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(to, audioCtx.currentTime + dur);
}
function makeNoise(ctx, type="white") {
  const sr = ctx.sampleRate, buf = ctx.createBuffer(1, sr*3, sr), d = buf.getChannelData(0);
  for (let i = 0; i < buf.length; i++) d[i] = Math.random()*2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  return src;
}

function buildDeepWaves() {
  const ctx = initAudio();
  [[55,0.022],[82.4,0.016],[110,0.012]].forEach(([f,v]) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = "sine"; osc.frequency.value = f;
    lp.type = "lowpass"; lp.frequency.value = 400;
    gain.gain.value = 0;
    osc.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
    osc.start(); fadeGain(gain, 0, v); audioNodes.push({osc,gain});
  });
}
function buildRain() {
  const ctx = initAudio();
  const src = makeNoise(ctx);
  const lp = ctx.createBiquadFilter(); lp.type = "bandpass"; lp.frequency.value = 1800; lp.Q.value = 0.5;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(lp); lp.connect(g); g.connect(ctx.destination); src.start();
  fadeGain(g, 0, 0.12); audioNodes.push({src,gain:g});
}
function buildForest() {
  const ctx = initAudio();
  // Wind
  const ns = makeNoise(ctx), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 600;
  const gn = ctx.createGain(); gn.gain.value = 0;
  ns.connect(lp); lp.connect(gn); gn.connect(ctx.destination); ns.start();
  fadeGain(gn, 0, 0.04); audioNodes.push({src:ns,gain:gn});
  // Birdsong tones
  [[880,0.008],[1320,0.006],[660,0.007]].forEach(([f,v],i) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = f; g.gain.value = 0;
    osc.connect(g); g.connect(ctx.destination); osc.start();
    fadeGain(g,0,v,3+i); audioNodes.push({osc,gain:g});
  });
}
function buildCafe() {
  const ctx = initAudio();
  const ns = makeNoise(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = 0;
  ns.connect(bp); bp.connect(g); g.connect(ctx.destination); ns.start();
  fadeGain(g,0,0.07); audioNodes.push({src:ns,gain:g});
}
function buildWhiteNoise() {
  const ctx = initAudio();
  const src = makeNoise(ctx), g = ctx.createGain(); g.gain.value = 0;
  src.connect(g); g.connect(ctx.destination); src.start();
  fadeGain(g,0,0.07); audioNodes.push({src,gain:g});
}
function buildBinaural() {
  const ctx = initAudio();
  // 200hz left, 240hz right = 40hz beat
  [200,240].forEach((f,i) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), panner = ctx.createStereoPanner();
    osc.type = "sine"; osc.frequency.value = f;
    panner.pan.value = i === 0 ? -1 : 1;
    gain.gain.value = 0;
    osc.connect(panner); panner.connect(gain); gain.connect(ctx.destination);
    osc.start(); fadeGain(gain,0,0.018); audioNodes.push({osc,gain});
  });
}
function buildLofi() {
  const ctx = initAudio();
  const scale = [261.6, 311.1, 349.2, 415.3, 523.3];
  scale.forEach((f,i) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = f; g.gain.value = 0;
    osc.connect(g); g.connect(ctx.destination); osc.start();
    fadeGain(g,0,0.012,3+i*0.5); audioNodes.push({osc,gain:g});
  });
}
function buildThunder() {
  const ctx = initAudio();
  // Low rumble
  const ns = makeNoise(ctx), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 120;
  const g = ctx.createGain(); g.gain.value = 0;
  ns.connect(lp); lp.connect(g); g.connect(ctx.destination); ns.start();
  fadeGain(g,0,0.15); audioNodes.push({src:ns,gain:g});
  // Rain layer
  const rn = makeNoise(ctx), bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.5;
  const gr = ctx.createGain(); gr.gain.value = 0;
  rn.connect(bp); bp.connect(gr); gr.connect(ctx.destination); rn.start();
  fadeGain(gr,0,0.07); audioNodes.push({src:rn,gain:gr});
}
function buildFire() {
  const ctx = initAudio();
  const ns = makeNoise(ctx), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 800;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 100;
  const g = ctx.createGain(); g.gain.value = 0;
  ns.connect(lp); lp.connect(hp); hp.connect(g); g.connect(ctx.destination); ns.start();
  fadeGain(g,0,0.09); audioNodes.push({src:ns,gain:g});
}

function startSound(preset) {
  stopSound(); if (preset === "none") return;
  const p = SOUND_PRESETS[preset]; if (!p?.fn) return;
  try { p.fn(); } catch(e) { console.warn("Audio error", e); }
}
function stopSound() {
  if (audioCtx) {
    audioNodes.forEach(({osc,gain,src}) => {
      try {
        if (gain) { gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5); }
        setTimeout(() => { try { if(osc) osc.stop(); if(src) src.stop(); } catch(e){} }, 600);
      } catch(e){}
    });
  }
  audioNodes = [];
}

/* ---- Events ---- */
function setupFocusEvents(tasks) {
  // Mode pills
  document.querySelectorAll(".focus-pill").forEach(p => {
    p.onclick = () => {
      document.querySelectorAll(".focus-pill").forEach(x => x.classList.remove("active"));
      p.classList.add("active");
      clearInterval(timerInterval); timerRunning = false;
      const btn = document.getElementById("focusStart"); if (btn) btn.innerHTML = "▶ Start";
      timerSecs = MODES[p.dataset.mode] || 25*60; currentTotal = timerSecs;
      setPhase({focus:"Ready",short:"Short Break",long:"Long Break"}[p.dataset.mode] || "Ready");
      updateDisplay(); updateRing(1);
    };
  });

  // Start / Pause
  document.getElementById("focusStart").onclick = () => {
    const btn = document.getElementById("focusStart");
    if (timerRunning) {
      clearInterval(timerInterval); timerRunning = false;
      btn.innerHTML = "▶ Resume"; setPhase("Paused");
      if (currentSoundPreset !== "none") stopSound();
    } else {
      timerRunning = true; btn.innerHTML = "⏸ Pause";
      const mode = document.querySelector(".focus-pill.active")?.dataset.mode || "focus";
      setPhase({focus:"Focusing…",short:"Taking a break…",long:"Long break…"}[mode] || "Focusing…");
      if (currentSoundPreset !== "none") startSound(currentSoundPreset);
      timerInterval = setInterval(() => {
        if (--timerSecs <= 0) {
          clearInterval(timerInterval); timerRunning = false;
          timerSecs = currentTotal; btn.innerHTML = "▶ Start";
          setPhase("Done! 🎉"); updateDisplay(); updateRing(1); stopSound();
          if (Notification.permission === "granted")
            new Notification("Aurora", { body: "Session complete! Take a break 🎉" });
          import("../auroraNotify.js").then(m => m.auroraNotify({
            title:"Session Complete", message:"Great work! You earned a break.", type:"success"
          }));
        }
        updateDisplay(); updateRing(timerSecs / currentTotal);
      }, 1000);
    }
  };

  document.getElementById("focusReset").onclick = () => {
    clearInterval(timerInterval); timerRunning = false; stopSound();
    const btn = document.getElementById("focusStart"); if (btn) btn.innerHTML = "▶ Start";
    timerSecs = currentTotal; updateDisplay(); updateRing(1); setPhase("Ready");
  };

  document.getElementById("focusSkip").onclick = () => {
    clearInterval(timerInterval); timerRunning = false; stopSound();
    timerSecs = 0; updateDisplay(); updateRing(0);
    const btn = document.getElementById("focusStart"); if (btn) btn.innerHTML = "▶ Start";
    setPhase("Skipped");
  };

  // Task
  document.getElementById("focusTaskSel").onchange = e => {
    focusTaskId = e.target.value;
    const task = tasks.find(t => t.id === focusTaskId);
    const title = document.getElementById("focusTaskTitle");
    const doneBtn = document.getElementById("focusDoneBtn");
    if (task) { title.textContent = task.title; doneBtn.style.display = "inline-flex"; }
    else { title.textContent = ""; doneBtn.style.display = "none"; }
  };
  document.getElementById("focusDoneBtn").onclick = async () => {
    if (!focusTaskId) return;
    await completeTaskInCloud(focusTaskId);
    showToast("Task complete! 🔥");
    document.getElementById("focusTaskSel").value = "";
    document.getElementById("focusTaskTitle").textContent = "";
    document.getElementById("focusDoneBtn").style.display = "none";
    focusTaskId = null;
  };

  // Sound
  document.querySelectorAll(".focus-sound-pill").forEach(p => {
    p.onclick = () => {
      document.querySelectorAll(".focus-sound-pill").forEach(x => x.classList.remove("active"));
      p.classList.add("active");
      currentSoundPreset = p.dataset.sound;
      if (timerRunning) startSound(currentSoundPreset);
      else stopSound();
    };
  });
}
