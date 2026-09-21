(() => {
  const form          = document.querySelector("#authForm");
  const emailInput    = document.querySelector("#emailInput");
  const passwordInput = document.querySelector("#passwordInput");
  const confirmInput  = document.querySelector("#confirmInput");
  const confirmField  = document.querySelector("#confirmField");
  const matchHint     = document.querySelector("#matchHint");
  const pwdStrength   = document.querySelector("#pwdStrength");
  const pwdStrengthFill = document.querySelector("#pwdStrengthFill");
  const pwdChecklist  = document.querySelector("#pwdChecklist");
  const submitBtn     = document.querySelector("#authSubmit");
  const submitText    = submitBtn.querySelector(".auth-submit-text");
  const tabs          = document.querySelectorAll(".auth-tab");
  const footToggles   = document.querySelectorAll(".auth-foot-toggle, [data-auth-mode]");
  const errorBox      = document.querySelector("#authError");
  const errorText     = document.querySelector("#authErrorText");
  const togglePwdBtn  = document.querySelector("#togglePassword");
  const togglePwdIcon = document.querySelector("#togglePasswordIcon");
  const authFoot      = document.querySelector("#authFoot");
  const forgotLink    = document.querySelector("#forgotLink");

  const ICON_EYE = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  const ICON_EYE_OFF = `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;

  let mode = "login";

  function setMode(next) {
    mode = next;
    tabs.forEach(t => t.classList.toggle("active", t.dataset.authMode === mode));
    const isRegister = mode === "register";

    confirmField.hidden  = !isRegister;
    pwdStrength.hidden   = !isRegister;
    passwordInput.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
    passwordInput.placeholder = isRegister ? "Create a strong password" : "••••••••";
    submitText.textContent = isRegister ? "Create account" : "Sign in";

    if (forgotLink) forgotLink.style.visibility = isRegister ? "hidden" : "visible";

    authFoot.innerHTML = isRegister
      ? `Already have an account? <button type="button" data-auth-mode="login" class="auth-foot-toggle">Sign in</button>`
      : `New here? <button type="button" data-auth-mode="register" class="auth-foot-toggle">Create an account</button>`;
    bindFootToggle();

    hideError();
    if (isRegister) updatePasswordChecklist();
  }

  function bindFootToggle() {
    authFoot.querySelectorAll("[data-auth-mode]").forEach(btn => {
      btn.addEventListener("click", () => setMode(btn.dataset.authMode));
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => setMode(tab.dataset.authMode));
  });
  bindFootToggle();

  // Show/hide password toggle
  togglePwdBtn.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    togglePwdIcon.innerHTML = isHidden ? ICON_EYE_OFF : ICON_EYE;
    togglePwdBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });

  // Password strength
  function evaluatePassword(pwd) {
    return {
      length:  pwd.length >= 8,
      upper:   /[A-Z]/.test(pwd),
      number:  /[0-9]/.test(pwd),
      special: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]/\\;'`~]/.test(pwd)
    };
  }

  function updatePasswordChecklist() {
    const checks = evaluatePassword(passwordInput.value);
    let metCount = 0;
    Object.entries(checks).forEach(([key, met]) => {
      const li = pwdChecklist.querySelector(`[data-req="${key}"]`);
      if (li) li.classList.toggle("met", met);
      if (met) metCount++;
    });
    pwdStrengthFill.classList.remove("weak", "fair", "good", "strong");
    if (metCount === 0)      pwdStrengthFill.style.width = "0";
    else if (metCount === 1) pwdStrengthFill.classList.add("weak");
    else if (metCount === 2) pwdStrengthFill.classList.add("fair");
    else if (metCount === 3) pwdStrengthFill.classList.add("good");
    else if (metCount >= 4)  pwdStrengthFill.classList.add("strong");

    updateMatchHint();
  }

  function updateMatchHint() {
    if (mode !== "register") return;
    const a = passwordInput.value;
    const b = confirmInput.value;
    if (!b) { matchHint.textContent = ""; matchHint.className = "auth-match-hint"; return; }
    if (a === b) { matchHint.textContent = "Passwords match"; matchHint.className = "auth-match-hint match"; }
    else         { matchHint.textContent = "Passwords do not match"; matchHint.className = "auth-match-hint no-match"; }
  }

  passwordInput.addEventListener("input", () => {
    if (mode === "register") updatePasswordChecklist();
    hideError();
  });
  confirmInput.addEventListener("input", updateMatchHint);

  function showError(message) {
    errorText.textContent = message;
    errorBox.hidden = false;
  }
  function hideError() { errorBox.hidden = true; }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    if (loading) {
      submitBtn.innerHTML = `<span class="spinner-sm"></span><span class="auth-submit-text">${mode === "register" ? "Creating account..." : "Signing in..."}</span>`;
    } else {
      submitBtn.innerHTML = `<span class="auth-submit-text">${mode === "register" ? "Create account" : "Sign in"}</span>`;
    }
  }

  // Client-side validation that mirrors server expectations
  function validate() {
    const email = emailInput.value.trim();
    const pwd   = passwordInput.value;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError("Please enter a valid email address.");
      emailInput.focus();
      return null;
    }

    if (mode === "register") {
      const checks = evaluatePassword(pwd);
      if (!checks.length) { showError("Password must be at least 8 characters."); passwordInput.focus(); return null; }
      if (!checks.upper)  { showError("Password must include at least one uppercase letter."); passwordInput.focus(); return null; }
      if (!checks.number) { showError("Password must include at least one number."); passwordInput.focus(); return null; }
      if (pwd !== confirmInput.value) { showError("Passwords do not match."); confirmInput.focus(); return null; }
    } else if (!pwd) {
      showError("Please enter your password.");
      passwordInput.focus();
      return null;
    }

    return { email, password: pwd };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const data = validate();
    if (!data) return;

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        showError(body.error || (mode === "login" ? "Sign in failed." : "Could not create account."));
        setLoading(false);
        return;
      }

      if (mode === "register") {
        // Server requires login after register
        if (window.showPageLoader) window.showPageLoader();
        // Auto-attempt login
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        const loginBody = await loginRes.json().catch(() => ({}));
        if (loginRes.ok) {
          if (loginBody.role !== "ADMIN" && loginBody.role !== "GOD") {
            try { localStorage.setItem("Falcon_join_tg", "1"); } catch {}
          }
          location.href = "/logs";
        } else {
          if (window.hidePageLoader) window.hidePageLoader();
          // Show success then switch to login mode
          showError("Account created. Please sign in.");
          errorBox.style.background = "rgba(34,197,94,0.08)";
          errorBox.style.borderColor = "rgba(34,197,94,0.4)";
          errorBox.style.color = "#a7f3c0";
          setMode("login");
          setLoading(false);
        }
        return;
      }

      // Login success
      if (window.showPageLoader) window.showPageLoader();
      if (body.role === "ADMIN" || body.role === "GOD") {
        location.href = "/admin.html";
      } else {
        location.href = "/logs";
      }
    } catch (err) {
      showError("Network error. Please try again.");
      setLoading(false);
    }
  });

  // Init
  setMode("login");
  emailInput.focus();
})();
