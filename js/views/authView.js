import { register, login, loginWithGoogle, sendPasswordReset, verifyEmail, logout } from "../firebase/authService.js";

let mode = "login";

export function initAuthLogic(onSuccess) {
  const hero      = document.getElementById("hero");
  const modal     = document.getElementById("authModal");
  const errorMsg  = document.getElementById("authError");

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

  document.getElementById("loginEntry").onclick    = () => openModal("login");
  document.getElementById("registerEntry").onclick = () => openModal("register");

  document.getElementById("dismissBtn").onclick = () => {
    clearError();
    hero.classList.remove("is-blurred");
    modal.style.opacity = "0";
    setTimeout(() => { modal.style.display = "none"; showAuthPanel("main"); }, 400);
  };

  document.getElementById("primaryAuthBtn").onclick = async () => {
    const btn = document.getElementById("primaryAuthBtn");
    if (btn.disabled) return; // prevent double-press
    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPassword").value;
    if (!email || !pass) { showError("Please enter your email and password."); return; }
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = "Please wait…";
    try {
      clearError();
      if (mode === "login") {
        const cred = await login(email, pass);
        // Login always succeeds if credentials are correct.
        // Email verification is optional — we show a soft banner inside the app
        // but don't block access, since Firebase email delivery can be unreliable.
        if (onSuccess) onSuccess();
        const authLayer = document.getElementById("authLayer");
        const appContainer = document.getElementById("appContainer");
        if (authLayer && appContainer) {
          authLayer.style.display = "none";
          appContainer.style.display = "flex";
        }
      } else {
        // Set flag FIRST so onAuthStateChanged doesn't enter the app prematurely
        sessionStorage.setItem("aurora_pending_verify", "1");

        // Registration: create account, send verification email, show verify panel
        let cred;
        try {
          cred = await register(email, pass);
        } catch(regErr) {
          sessionStorage.removeItem("aurora_pending_verify");
          throw regErr; // re-throw so outer catch shows the error
        }

        // Send verification email
        let emailSent = false;
        try {
          await verifyEmail();
          emailSent = true;
        } catch(e) {
          console.warn("Verification email failed:", e.message);
        }

        // Show verify panel — bright, readable text
        const addrEl = document.getElementById("verifyEmailAddr");
        if (addrEl) addrEl.textContent = email;

        const verifyMsg = document.getElementById("verifyMsg");
        if (verifyMsg) {
          if (emailSent) {
            verifyMsg.textContent = "✉️ Verification email sent! Check your inbox.";
            verifyMsg.style.color = "#00c87a";
          } else {
            verifyMsg.textContent = "Couldn't send email — press Resend below.";
            verifyMsg.style.color = "#f59e0b";
          }
        }

        document.getElementById("authTitle").textContent = "VERIFY YOUR EMAIL";
        showAuthPanel("verify");
      }
    } catch (err) {
      console.error("Auth error:", err.code, err.message);
      showError(friendlyError(err.code));
    } finally {
      const b = document.getElementById("primaryAuthBtn");
      if (b) { b.disabled = false; b.textContent = origText; }
    }
  };

  // Resend verification email
  document.getElementById("resendVerifyBtn").onclick = async () => {
    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPassword").value;
    const msg   = document.getElementById("verifyMsg");
    try {
      // Re-login briefly to resend
      const cred = await login(email, pass);
      if (!cred.user.emailVerified) {
        await verifyEmail();
        await logout();
        msg.textContent = "Verification email resent! Check your inbox.";
        msg.style.color = "#00c87a";
      } else {
        // Already verified — log them in
        sessionStorage.removeItem("aurora_pending_verify");
        msg.textContent = "Email verified! Signing in…";
        msg.style.color = "#00c87a";
        setTimeout(() => { if (onSuccess) onSuccess(); }, 800);
      }
    } catch(e) {
      msg.textContent = "Couldn't resend — try again.";
      msg.style.color = "#ef4444";
    }
  };

  // "Already verified" / check button
  document.getElementById("checkVerifyBtn").onclick = async () => {
    const email = document.getElementById("authEmail").value.trim();
    const pass  = document.getElementById("authPassword").value;
    const msg   = document.getElementById("verifyMsg");
    try {
      const cred = await login(email, pass);
      await cred.user.reload(); // force-refresh verification status
      if (cred.user.emailVerified) {
        sessionStorage.removeItem("aurora_pending_verify"); // allow app entry
        msg.textContent = "✓ Email verified! Welcome to Aurora!";
        msg.style.color = "#00c87a";
        setTimeout(() => { if (onSuccess) onSuccess(); }, 600);
      } else {
        await logout();
        msg.textContent = "Not verified yet — check your inbox (also check Spam).";
        msg.style.color = "#f59e0b";
      }
    } catch(e) {
      msg.textContent = friendlyError(e.code);
      msg.style.color = "#ef4444";
    }
  };

  document.getElementById("backFromVerify").onclick = () => {
    document.getElementById("authTitle").textContent = "WELCOME BACK";
    showAuthPanel("main");
  };

  document.getElementById("googleBtn").onclick = async () => {
    try { clearError(); await loginWithGoogle(); if (onSuccess) onSuccess(); }
    catch (err) { showError(friendlyError(err.code)); }
  };

  // Forgot password flow
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

  // Enter key support
  document.getElementById("authPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("primaryAuthBtn").click();
  });

  startAuroraBackground();
}

function friendlyError(code) {
  const map = {
    // Login errors
    "auth/user-not-found":           "No account found with that email.",
    "auth/wrong-password":           "Incorrect password. Try again.",
    "auth/invalid-credential":       "Incorrect email or password.",
    "auth/invalid-email":            "Please enter a valid email address.",
    "auth/user-disabled":            "This account has been disabled.",
    // Registration errors
    "auth/email-already-in-use":     "This email is already registered. Try logging in.",
    "auth/weak-password":            "Password must be at least 6 characters.",
    "auth/operation-not-allowed":    "Email sign-up is not enabled yet. Contact the app owner.",
    "auth/admin-restricted-operation":"Email sign-up is not enabled yet. Contact the app owner.",
    // Network / other
    "auth/network-request-failed":   "Network error — check your internet connection.",
    "auth/too-many-requests":        "Too many attempts. Please wait a few minutes and try again.",
    "auth/popup-closed-by-user":     "Google sign-in was cancelled.",
    "auth/popup-blocked":            "Pop-up was blocked by the browser. Allow pop-ups and try again.",
    "auth/cancelled-popup-request":  "Sign-in cancelled.",
    "auth/internal-error":           "An internal error occurred. Please try again.",
    "auth/unauthorized-domain":       "This browser or device isn't authorized yet. Try opening aurora on your main device, or contact the app owner to add this domain.",
    "auth/app-deleted":               "App configuration error. Please refresh and try again.",
    "auth/requires-recent-login":     "Please log out and log in again to continue.",
  };
  return map[code] || `Something went wrong (${code || "unknown"}). Please try again.`;
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