/* ===============================
   COMMUNITY FOCUS ROOMS
   Real-time via Firestore
   Users see each other's Aura glow
================================= */
import { db, auth } from "./firebase/firebaseConfig.js";
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ROOM_COLORS = ["#00f5a0","#00d9f5","#7800ff","#f97316","#ef4444","#f59e0b","#ec4899","#06b6d4"];

let roomCanvas, roomCtx, roomAnimFrame, roomTime=0;
let unsubscribeRoom=null;
let currentRoomId=null;
let presenceInterval=null;

export function renderFocusRooms() {
  return `
    <div class="rooms-container">
      <div class="rooms-header">
        <div>
          <h2 class="rooms-title">Focus Rooms</h2>
          <p class="rooms-sub">Work silently alongside others. No words. Just presence.</p>
        </div>
        <button class="primary-btn" id="createRoomBtn">+ Create Room</button>
      </div>
      <div class="rooms-list" id="roomsList">
        <div class="dash-loading">Loading rooms...</div>
      </div>

      <!-- CREATE ROOM MODAL -->
      <div class="task-modal-overlay" id="createRoomModal">
        <div class="task-modal">
          <div class="modal-header"><h2>New Focus Room</h2><button class="modal-close-btn" id="closeCreateRoom">&times;</button></div>
          <div class="form-group">
            <label>Room Name</label>
            <input type="text" id="roomName" placeholder="Deep Work Session...">
          </div>
          <div class="form-group">
            <label>Duration</label>
            <select id="roomDuration">
              <option value="25">25 minutes (Pomodoro)</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
            </select>
          </div>
          <div class="modal-actions">
            <button class="primary-btn" id="confirmCreateRoom">Create Room</button>
            <button class="ghost-btn" id="cancelCreateRoom">Cancel</button>
          </div>
        </div>
      </div>

      <!-- ROOM SESSION VIEW -->
      <div class="room-session" id="roomSession" style="display:none">
        <canvas id="roomCanvas" class="room-canvas"></canvas>
        <div class="room-session-ui">
          <div class="room-session-header">
            <h2 class="room-session-name" id="roomSessionName"></h2>
            <div class="room-session-timer" id="roomTimer">--:--</div>
          </div>
          <div class="room-auras" id="roomAuras"></div>
          <div class="room-session-footer">
            <p class="room-footer-text">You are in silent focus. Others can see your Aura.</p>
            <button class="ghost-btn" id="leaveRoomBtn">Leave Room</button>
          </div>
        </div>
      </div>
    </div>`;
}

export async function initFocusRooms() {
  loadRoomsList();
  setupRoomEvents();
}

async function loadRoomsList() {
  const roomsCol = collection(db,"focusRooms");
  onSnapshot(roomsCol, snap=>{
    const rooms=snap.docs.map(d=>({id:d.id,...d.data()}));
    const list=document.getElementById("roomsList");
    if(!list) return;
    if(!rooms.length){
      list.innerHTML=`<div class="rooms-empty"><p>No active rooms. Create one and invite others by sharing the room name.</p></div>`;
      return;
    }
    list.innerHTML=rooms.map(r=>{
      const members=Object.keys(r.members||{}).length;
      const created=r.createdAt?.seconds?new Date(r.createdAt.seconds*1000):new Date();
      const elapsed=Math.floor((Date.now()-created)/60000);
      const remaining=Math.max(0,(r.duration||25)-elapsed);
      return `
        <div class="room-card" data-roomid="${r.id}">
          <div class="room-card-auras">${Array.from({length:Math.min(members,5)},(_,i)=>`
            <div class="room-card-aura" style="background:${ROOM_COLORS[i%ROOM_COLORS.length]};margin-left:${i>0?"-8px":"0"}"></div>`).join("")}
          </div>
          <div class="room-card-info">
            <div class="room-card-name">${r.name}</div>
            <div class="room-card-meta">${members} focusing · ${remaining}min remaining</div>
          </div>
          <button class="primary-btn room-join-btn" data-roomid="${r.id}">Join</button>
        </div>`;
    }).join("");
  });
}

function setupRoomEvents() {
  document.getElementById("createRoomBtn").onclick=()=>document.getElementById("createRoomModal").style.display="flex";
  document.getElementById("closeCreateRoom").onclick=()=>document.getElementById("createRoomModal").style.display="none";
  document.getElementById("cancelCreateRoom").onclick=()=>document.getElementById("createRoomModal").style.display="none";
  document.getElementById("confirmCreateRoom").onclick=createRoom;
  document.getElementById("leaveRoomBtn").onclick=leaveRoom;
  document.addEventListener("click",e=>{
    const joinBtn=e.target.closest(".room-join-btn");
    if(joinBtn) joinRoom(joinBtn.dataset.roomid);
  });
}

async function createRoom() {
  const name=document.getElementById("roomName").value.trim()||"Focus Room";
  const duration=parseInt(document.getElementById("roomDuration").value)||25;
  const user=auth.currentUser;
  const roomRef=doc(collection(db,"focusRooms"));
  await setDoc(roomRef,{name,duration,createdAt:serverTimestamp(),members:{[user.uid]:{color:ROOM_COLORS[Math.floor(Math.random()*ROOM_COLORS.length)],joinedAt:serverTimestamp()}}});
  document.getElementById("createRoomModal").style.display="none";
  joinRoom(roomRef.id);
}

async function joinRoom(roomId) {
  const user=auth.currentUser;
  currentRoomId=roomId;
  const myColor=ROOM_COLORS[Math.floor(Math.random()*ROOM_COLORS.length)];

  // Add self to room members
  await setDoc(doc(db,"focusRooms",roomId,"members",user.uid),{color:myColor,uid:user.uid,joinedAt:serverTimestamp()});
  await setDoc(doc(db,"focusRooms",roomId),{[`members.${user.uid}`]:{color:myColor,joinedAt:serverTimestamp()}},{merge:true});

  // Show session view
  document.getElementById("roomSession").style.display="flex";
  document.getElementById("roomsList").closest(".rooms-container").style.display="none";

  initRoomCanvas();

  // Listen to members
  unsubscribeRoom=onSnapshot(doc(db,"focusRooms",roomId), snap=>{
    if(!snap.exists()) return;
    const data=snap.data();
    document.getElementById("roomSessionName").textContent=data.name||"Focus Room";
    renderAuras(data.members||{}, myColor, user.uid);

    // Timer
    const created=data.createdAt?.seconds?new Date(data.createdAt.seconds*1000):new Date();
    const elapsed=Math.floor((Date.now()-created)/1000);
    const totalSec=(data.duration||25)*60;
    const remaining=Math.max(0,totalSec-elapsed);
    const m=Math.floor(remaining/60), s=remaining%60;
    const el=document.getElementById("roomTimer");
    if(el) el.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  });

  // Update timer every second
  presenceInterval=setInterval(()=>{
    // Re-read timer from state (snapshot handles it)
  },1000);
}

function renderAuras(members, myColor, myUid) {
  const auras=document.getElementById("roomAuras");
  if(!auras) return;
  const entries=Object.entries(members).filter(([uid])=>uid!==myUid);
  // My aura
  auras.innerHTML=`
    <div class="aura-wrap">
      <div class="aura-pulse aura-self" style="--ac:${myColor}"></div>
      <div class="aura-label">You</div>
    </div>
    ${entries.map(([uid,m])=>`
      <div class="aura-wrap">
        <div class="aura-pulse" style="--ac:${m.color||"#00d9f5"}"></div>
        <div class="aura-label">${uid.slice(0,4)}···</div>
      </div>`).join("")}`;
}

async function leaveRoom() {
  if(unsubscribeRoom) unsubscribeRoom();
  clearInterval(presenceInterval);
  if(currentRoomId&&auth.currentUser){
    try{ await deleteDoc(doc(db,"focusRooms",currentRoomId,"members",auth.currentUser.uid)); }catch(e){}
  }
  cancelAnimationFrame(roomAnimFrame);
  currentRoomId=null;
  document.getElementById("roomSession").style.display="none";
  document.getElementById("roomsList").closest(".rooms-container").style.display="flex";
}

function initRoomCanvas() {
  roomCanvas=document.getElementById("roomCanvas");
  if(!roomCanvas) return;
  roomCtx=roomCanvas.getContext("2d");
  roomCanvas.width=window.innerWidth; roomCanvas.height=window.innerHeight;
  roomTime=0;
  function draw(){
    roomCtx.fillStyle="#010108"; roomCtx.fillRect(0,0,roomCanvas.width,roomCanvas.height);
    for(let i=0;i<roomCanvas.width;i+=5){
      const w=Math.sin(i*0.002+roomTime*0.008)*80+Math.sin(i*0.004+roomTime*0.012)*40;
      const y=roomCanvas.height/2+w;
      const g=roomCtx.createLinearGradient(0,y-150,0,y+150);
      g.addColorStop(0,"transparent"); g.addColorStop(0.4,"rgba(0,245,160,0.12)"); g.addColorStop(0.7,"rgba(120,0,255,0.08)"); g.addColorStop(1,"transparent");
      roomCtx.fillStyle=g; roomCtx.fillRect(i,y-150,5,300);
    }
    roomTime++; roomAnimFrame=requestAnimationFrame(draw);
  }
  draw();
}
