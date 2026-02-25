import { register, login, loginWithGoogle, sendPasswordReset, verifyEmail, logout } from "../firebase/authService.js";
import { auth } from "../firebase/firebaseConfig.js";
import { deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let mode = "login";

export function initAuthLogic(onSuccess) {
  const hero     = document.getElementById("hero");
  const modal    = document.getElementById("authModal");
  const errorMsg = document.getElementById("authError");

  function showError(msg) { if (errorMsg) errorMsg.textContent = msg; }
  function clearError()   { if (errorMsg) errorMsg.textContent = ""; }

  function openModal(m) {
    mode = m; clearError();
    hero.classList.add("is-blurred");
    modal.style.display = "flex";
    setTimeout(() => modal.style.opacity = "1", 10);
    showAuthPanel("main");
    document.getElementById("authTitle").textContent = m === "login" ? "WELCOME BACK" : "CREATE ACCOUNT";
    document.getElementById("forgotLinkWrap").style.display = m === "login" ? "block" : "none";
  }

  function showAuthPanel(panel) {
    document.getElementById("authPanelMain").style.display   = panel === "main"   ? "flex" : "none";
    document.getElementById("authPanelForgot").style.display = panel === "forgot" ? "flex" : "none";
    document.getElementById("authPanelReset").style.display  = panel === "reset"  ? "flex" : "none";
    document.getElementById("authPanelVerify").style.display = panel === "verify" ? "flex" : "none";
  }

  function enterApp() {
    if (onSuccess) onSuccess();
    document.getElementById("authLayer").style.display    = "none";
    document.getElementById("appContainer").style.display = "flex";
  }

  function showVerifyPanel(email, msg) {
    document.getElementById("authTitle").textContent = "VERIFY YOUR EMAIL";
    const msgEl = document.getElementById("verifyMsg");
    msgEl.textContent = msg;
    msgEl.style.color = "var(--muted)";
    showAuthPanel("verify");
  }

  document.getElementById("loginEntry").onclick    = () => openModal("login");
  document.getElementById("registerEntry").onclick = () => openModal("register");

  document.getElementById("dismissBtn").onclick = () => {
    clearError();
    hero.classList.remove("is-blurred");
    modal.style.opacity = "0";
    setTimeout(() => { modal.style.display = "none"; showAuthPanel("main"); }, 400);
  };

  document.getElementById("primaryAuthBtn").onclick = async () => {
    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPassword").value;
    if (!email || !pass) { showError("Please enter your email and password."); return; }

    const btn = document.getElementById("primaryAuthBtn");
    btn.disabled = true;
    btn.textContent = "Please wait…";
    clearError();

    try {
      if (mode === "login") {
        // ── LOGIN ── sign in, check verification, block if not verified
        const cred = await login(email, pass);

        if (!cred.user.emailVerified) {
          await logout(); // kick them out
          showVerifyPanel(email,
            `Your email ${email} is not verified yet. Check your inbox for the verification link and click it, then sign in here.`
          );
          btn.disabled = false;
          btn.textContent = "Sign In";
          return;
        }

        enterApp();

      } else {
        // ── SIGN UP ──
        // Step 1: Create account
        const cred = await register(email, pass);

        // Step 2: Send verification email
        try { await verifyEmail(); } catch(e) { /* ignore — gmail may delay */ }

        // Step 3: Sign them OUT immediately — they must verify before entering
        await logout();

        // Step 4: Show verify screen
        showVerifyPanel(email,
          `Account created! A verification link was sent to ${email}. Click it in your inbox, then come back and sign in.`
        );
      }

    } catch (err) {
      showError(friendlyError(err.code));
    }

    btn.disabled = false;
    btn.textContent = mode === "login" ? "Sign In" : "Create Account";
  };

  // Resend verification email
  document.getElementById("resendVerifyBtn").onclick = async () => {
    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPassword").value;
    const msg   = document.getElementById("verifyMsg");
    msg.textContent = "Sending…"; msg.style.color = "var(--muted)";
    try {
      const cred = await login(email, pass);
      if (cred.user.emailVerified) {
        // Already verified — let them in
        enterApp(); return;
      }
      await verifyEmail();
      await logout();
      msg.textContent = "✓ New verification link sent! Check your inbox.";
      msg.style.color = "#00c87a";
    } catch(e) {
      msg.textContent = "Check your email and password then try again.";
      msg.style.color = "#ef4444";
    }
  };

  // "I've clicked the link" — re-login and check
  document.getElementById("checkVerifyBtn").onclick = async () => {
    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPassword").value;
    const msg   = document.getElementById("verifyMsg");
    msg.textContent = "Checking…"; msg.style.color = "var(--muted)";
    try {
      const cred = await login(email, pass);
      if (cred.user.emailVerified) {
        msg.textContent = "✓ Verified! Signing you in…";
        msg.style.color = "#00c87a";
        setTimeout(enterApp, 700);
      } else {
        await logout();
        msg.textContent = "Not verified yet — click the link in your email first.";
        msg.style.color = "#f59e0b";
      }
    } catch(e) {
      msg.textContent = "Wrong email or password.";
      msg.style.color = "#ef4444";
    }
  };

  document.getElementById("backFromVerify").onclick = () => {
    document.getElementById("authTitle").textContent = mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT";
    showAuthPanel("main");
  };

  document.getElementById("googleBtn").onclick = async () => {
    try {
      clearError();
      await loginWithGoogle();
      // Google accounts are pre-verified
      enterApp();
    } catch (err) { showError(friendlyError(err.code)); }
  };

  document.getElementById("forgotLink").onclick = (e) => {
    e.preventDefault();
    document.getElementById("authTitle").textContent = "RESET PASSWORD";
    document.getElementById("resetEmailInput").value = document.getElementById("authEmail").value;
    document.getElementById("resetMsg").textContent = "";
    showAuthPanel("forgot");
  };

  document.getElementById("backFromForgot").onclick = () => {
    document.getElementById("authTitle").textContent = "WELCOME BACK";
    showAuthPanel("main");
  };

  document.getElementById("sendResetBtn").onclick = async () => {
    const email = document.getElementById("resetEmailInput").value.trim();
    const msg   = document.getElementById("resetMsg");
    if (!email) { msg.textContent = "Enter your email first."; msg.style.color="#ff4d4d"; return; }
    try {
      await sendPasswordReset(email);
      document.getElementById("authTitle").textContent = "CHECK YOUR EMAIL";
      showAuthPanel("reset");
    } catch (err) {
      msg.textContent = friendlyError(err.code);
      msg.style.color = "#ff4d4d";
    }
  };

  document.getElementById("backFromReset").onclick = () => {
    document.getElementById("authTitle").textContent = "WELCOME BACK";
    showAuthPanel("main");
  };

  document.getElementById("authPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("primaryAuthBtn").click();
  });

  startAuroraBackground();
}

function friendlyError(code) {
  const map = {
    "auth/user-not-found":       "No account found with that email.",
    "auth/wrong-password":       "Incorrect password. Try again.",
    "auth/invalid-credential":   "Incorrect email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/too-many-requests":    "Too many attempts. Try again later.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

function startAuroraBackground() {
  const aCanv = document.getElementById("aurora");
  if (!aCanv) return;
  const ctx = aCanv.getContext("2d");
  let time = 0;
  const resize = () => { aCanv.width = window.innerWidth; aCanv.height = window.innerHeight; };
  const draw = () => {
    ctx.fillStyle = "#010108"; ctx.fillRect(0,0,aCanv.width,aCanv.height);
    for (let i=0; i<aCanv.width; i+=5) {
      const h = Math.sin(i*0.002+time*0.01)*100, y = aCanv.height/2+h;
      const g = ctx.createLinearGradient(0,y-200,0,y+200);
      g.addColorStop(0,"transparent"); g.addColorStop(0.4,"rgba(0,255,195,0.4)"); g.addColorStop(0.7,"rgba(120,0,255,0.3)"); g.addColorStop(1,"transparent");
      ctx.fillStyle=g; ctx.fillRect(i,y-200,5,400);
    }
    time++; requestAnimationFrame(draw);
  };
  window.addEventListener("resize", resize); resize(); draw();
}
