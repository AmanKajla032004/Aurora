/* ===============================
   FULL COLOR PICKER MODULE
   Opens a rich palette with:
   - 64 preset swatches
   - Hue/Saturation gradient
   - Hex input
   - Recent colors (localStorage)
================================= */

const PRESETS = [
  "#ff0000","#ff3b3b","#ff6b6b","#ffaaaa",
  "#ff6600","#ff8c42","#ffb347","#ffd280",
  "#ffcc00","#ffd700","#ffe566","#fff0a0",
  "#33cc33","#4caf50","#66bb6a","#a5d6a7",
  "#00f5a0","#00c896","#00a878","#00755e",
  "#00d9f5","#00bcd4","#26c6da","#80deea",
  "#0099ff","#2196f3","#42a5f5","#90caf9",
  "#7800ff","#9c27b0","#ab47bc","#ce93d8",
  "#e91e63","#ec407a","#f06292","#f48fb1",
  "#ff1744","#f50057","#d500f9","#aa00ff",
  "#ffffff","#f5f5f5","#e0e0e0","#bdbdbd",
  "#9e9e9e","#757575","#616161","#424242",
  "#212121","#1a1a2e","#16213e","#0f3460",
  "#1b2838","#2d3748","#4a5568","#718096",
  "#2d1b69","#11001c","#1a0533","#0a0a0a",
];

let pickerActive = false;
let pickerCallback = null;
let recentColors = JSON.parse(localStorage.getItem("aurora_recent_colors")||"[]");

export function openColorPicker(anchorEl, currentColor, onSelect) {
  closePicker();
  pickerCallback = onSelect;

  const picker = document.createElement("div");
  picker.id    = "auroraColorPicker";
  picker.className = "acp-popup";

  const hsl   = hexToHsl(currentColor || "#00f5a0");
  const recentHTML = recentColors.slice(0,8).map(c=>`
    <div class="acp-swatch acp-recent" data-color="${c}" style="background:${c}" title="${c}"></div>`).join("");

  picker.innerHTML = `
    <div class="acp-section-label">Palette</div>
    <div class="acp-presets">
      ${PRESETS.map(c=>`<div class="acp-swatch ${c===currentColor?"acp-active":""}" data-color="${c}" style="background:${c}" title="${c}"></div>`).join("")}
    </div>
    ${recentColors.length ? `<div class="acp-section-label">Recent</div><div class="acp-recents">${recentHTML}</div>`:""}
    <div class="acp-section-label">Custom</div>
    <div class="acp-gradient-wrap">
      <canvas id="acpGradient" class="acp-gradient" width="220" height="140"></canvas>
      <div class="acp-cursor" id="acpCursor"></div>
    </div>
    <div class="acp-hue-wrap">
      <canvas id="acpHue" class="acp-hue" width="220" height="14"></canvas>
      <div class="acp-hue-cursor" id="acpHueCursor"></div>
    </div>
    <div class="acp-hex-row">
      <input type="text" class="acp-hex-input" id="acpHexInput" value="${currentColor||"#00f5a0"}" placeholder="#000000" maxlength="7">
      <div class="acp-preview" id="acpPreview" style="background:${currentColor||"#00f5a0"}"></div>
      <button class="primary-btn acp-confirm" id="acpConfirm">✓</button>
    </div>
  `;

  // Position near anchor — always fully visible within viewport
  document.body.appendChild(picker);
  const rect = anchorEl.getBoundingClientRect();
  const pw = 260, ph = 420;
  let top  = rect.bottom + 8;
  let left = rect.left;
  // Flip up if not enough room below
  if (top + ph > window.innerHeight - 10) top = rect.top - ph - 8;
  // Clamp horizontal
  left = Math.max(10, Math.min(left, window.innerWidth - pw - 10));
  // Clamp vertical
  top  = Math.max(10, Math.min(top,  window.innerHeight - ph - 10));
  picker.style.top  = `${top}px`;
  picker.style.left = `${left}px`;
  pickerActive = true;

  // Draw gradient
  let currentHue = hsl.h;
  drawGradient(currentHue);
  drawHue();
  positionHueCursor(currentHue);

  // Swatch clicks
  picker.querySelectorAll(".acp-swatch").forEach(sw=>{
    sw.onclick = e => { e.stopPropagation(); selectColor(sw.dataset.color); };
  });

  // Gradient pick
  const grad = document.getElementById("acpGradient");
  grad.onmousedown = e => {
    const pick = () => {
      const ctx = grad.getContext("2d");
      const rect = grad.getBoundingClientRect();
      const x = Math.max(0,Math.min(e.clientX-rect.left, grad.width));
      const y = Math.max(0,Math.min(e.clientY-rect.top, grad.height));
      const px = ctx.getImageData(Math.round(x),Math.round(y),1,1).data;
      const hex = rgbToHex(px[0],px[1],px[2]);
      document.getElementById("acpHexInput").value = hex;
      document.getElementById("acpPreview").style.background = hex;
      document.getElementById("acpCursor").style.left = `${x}px`;
      document.getElementById("acpCursor").style.top  = `${y}px`;
    };
    pick();
    const move = e2=>{e=e2;pick();};
    const up   = ()=>{document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);};
    document.addEventListener("mousemove",move);
    document.addEventListener("mouseup",up);
  };

  // Hue pick
  const hueBar = document.getElementById("acpHue");
  hueBar.onmousedown = e => {
    const pick = ev => {
      const rect = hueBar.getBoundingClientRect();
      const x = Math.max(0,Math.min(ev.clientX-rect.left, hueBar.width));
      currentHue = Math.round((x/hueBar.width)*360);
      drawGradient(currentHue);
      positionHueCursor(currentHue);
    };
    pick(e);
    const move=ev=>{e=ev;pick(ev);};
    const up=()=>{document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);};
    document.addEventListener("mousemove",move);
    document.addEventListener("mouseup",up);
  };

  // Hex input
  document.getElementById("acpHexInput").oninput = e => {
    const val = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      document.getElementById("acpPreview").style.background = val;
      const h = hexToHsl(val);
      currentHue = h.h;
      drawGradient(currentHue);
      positionHueCursor(currentHue);
    }
  };

  document.getElementById("acpConfirm").onclick = e => {
    e.stopPropagation();
    const hex = document.getElementById("acpHexInput").value;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) selectColor(hex);
  };

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", outsideClose);
  }, 50);
}

function outsideClose(e) {
  const picker = document.getElementById("auroraColorPicker");
  if (picker && !picker.contains(e.target)) closePicker();
}

export function closePicker() {
  const existing = document.getElementById("auroraColorPicker");
  if (existing) existing.remove();
  document.removeEventListener("click", outsideClose);
  pickerActive = false;
}

function selectColor(hex) {
  // Save to recents
  recentColors = [hex, ...recentColors.filter(c=>c!==hex)].slice(0,8);
  localStorage.setItem("aurora_recent_colors", JSON.stringify(recentColors));
  if (pickerCallback) pickerCallback(hex);
  closePicker();
}

// ---- Canvas drawing ----
function drawGradient(hue) {
  const canvas = document.getElementById("acpGradient");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  const baseColor = `hsl(${hue},100%,50%)`;
  const gX = ctx.createLinearGradient(0,0,w,0);
  gX.addColorStop(0,"#fff"); gX.addColorStop(1,baseColor);
  ctx.fillStyle=gX; ctx.fillRect(0,0,w,h);
  const gY = ctx.createLinearGradient(0,0,0,h);
  gY.addColorStop(0,"rgba(0,0,0,0)"); gY.addColorStop(1,"#000");
  ctx.fillStyle=gY; ctx.fillRect(0,0,w,h);
}
function drawHue() {
  const canvas = document.getElementById("acpHue");
  if (!canvas) return;
  const ctx=canvas.getContext("2d"), w=canvas.width, h=canvas.height;
  const g=ctx.createLinearGradient(0,0,w,0);
  [0,60,120,180,240,300,360].forEach((deg,i)=>g.addColorStop(i/6,`hsl(${deg},100%,50%)`));
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}
function positionHueCursor(hue) {
  const cur = document.getElementById("acpHueCursor");
  const bar = document.getElementById("acpHue");
  if(!cur||!bar) return;
  cur.style.left = `${(hue/360)*bar.width}px`;
}

// ---- Color utils ----
function hexToHsl(hex) {
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0, s=0, l=(max+min)/2;
  if(max!==min){const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;}h*=60;}
  return {h:Math.round(h),s:Math.round(s*100),l:Math.round(l*100)};
}
function rgbToHex(r,g,b) { return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join(""); }
