function getCart() {
  try {
    return JSON.parse(localStorage.getItem("mysterio_cart") || "[]");
  } catch (e) {
    return [];
  }
}

function setCart(cart) {
  localStorage.setItem("mysterio_cart", JSON.stringify(cart));
  updateCartBadge();
}

function addToCartStorage(item) {
  const cart = getCart();
  const existing = cart.find(i => i.productId === item.productId && i.variantId === item.variantId);
  if (existing) {
    existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
  } else {
    cart.push(item);
  }
  setCart(cart);
}

function updateCartBadge() {
  const cart = getCart();
  const totalCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  document.querySelectorAll("[data-cart-count]").forEach(badge => {
    badge.textContent = totalCount;
    badge.style.display = totalCount > 0 ? "flex" : "none";
    badge.classList.remove("pop");
    void badge.offsetWidth; // Trigger reflow for animation
    badge.classList.add("pop");
  });
}

// Global Header Switching Loading Effect (Disabled per user request)
function ensureLoadingBar() {
  const bar = document.querySelector("#pageLoadingBar");
  if (bar) bar.remove();
  return null;
}

function startPageLoading() {}
function finishPageLoading() {}

window.startPageLoading = startPageLoading;
window.finishPageLoading = finishPageLoading;
window.showPageLoader = startPageLoading;
window.hidePageLoader = finishPageLoading;

function initPageLoader() {
  const bar = document.querySelector("#pageLoadingBar");
  if (bar) bar.remove();
}

function showToast(message, viewCart = false) {
  let toast = document.querySelector("#mysterioToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "mysterioToast";
    document.body.appendChild(toast);
  }
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #110e0a;
    border: 1px solid rgba(234, 88, 12, 0.45);
    color: #ffffff;
    font-family: 'Montserrat', sans-serif;
    font-size: 13px;
    font-weight: 600;
    padding: 12px 18px;
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.9);
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: auto;
  `;
  const cartBtnHtml = viewCart ? `<a href="/cart.html" style="background:#ea580c;color:#fff;padding:5px 12px;border-radius:5px;text-decoration:none;font-size:12px;font-weight:700;white-space:nowrap;margin-left:4px;display:inline-flex;align-items:center;">View Cart &rarr;</a>` : "";
  toast.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg> <span>${message}</span> ${cartBtnHtml}`;
  toast.style.display = "flex";

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function initMobileDrawer() {
  const navActions = document.querySelector(".nav-actions");
  if (!navActions) return;

  // Add hamburger toggle if missing
  let toggleBtn = document.querySelector(".mobile-menu-toggle-btn");
  if (!toggleBtn) {
    toggleBtn = document.createElement("button");
    toggleBtn.className = "mobile-menu-toggle-btn";
    toggleBtn.type = "button";
    toggleBtn.setAttribute("aria-label", "Toggle navigation");
    toggleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    `;
    navActions.appendChild(toggleBtn);
  }

  // Create drawer & backdrop if missing
  let backdrop = document.querySelector("#mobileDrawerBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "mobileDrawerBackdrop";
    backdrop.className = "mobile-drawer-backdrop";
    document.body.appendChild(backdrop);
  }

  let drawer = document.querySelector("#mobileNavDrawer");
  if (!drawer) {
    drawer = document.createElement("div");
    drawer.id = "mobileNavDrawer";
    drawer.className = "mobile-nav-drawer";
    document.body.appendChild(drawer);
  }

  // Render drawer contents
  const currentPath = window.location.pathname;
  const isHome = currentPath === "/" || currentPath.endsWith("index.html") || currentPath.endsWith("logs.html");
  const isOrders = currentPath.endsWith("orders.html");
  const isSupport = currentPath.endsWith("support.html");
  const isDeposit = currentPath.endsWith("deposit.html");
  const isDashboard = currentPath.endsWith("dashboard.html");

  drawer.innerHTML = `
    <div class="mobile-drawer-header">
      <a href="/" class="mobile-drawer-brand">
        <img src="/logo.png" alt="Falcon Logs">
        <span class="brand-text">
          <span class="brand-name-top">Falcon</span>
          <span class="brand-name-bottom">Logs</span>
        </span>
      </a>
      <button type="button" class="mobile-drawer-close-btn" id="closeMobileDrawerBtn" aria-label="Close menu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <nav class="mobile-drawer-nav">
      <a href="/" class="mobile-drawer-link ${isHome ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
        <span>Logs</span>
      </a>
      <a href="/orders.html" class="mobile-drawer-link ${isOrders ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
        <span>Orders</span>
      </a>
      <a href="/support.html" class="mobile-drawer-link ${isSupport ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
        <span>Support</span>
      </a>
      <a href="/deposit.html" class="mobile-drawer-link ${isDeposit ? 'active' : ''}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
        <span id="mobileDrawerBalanceText">Balance</span>
      </a>
      <a href="/dashboard.html" class="mobile-drawer-link ${isDashboard ? 'active' : ''}" id="mobileDrawerAccountLink">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span id="mobileDrawerAccountText">Account</span>
      </a>
    </nav>
    <div class="mobile-drawer-footer">
      <a href="/cart.html" class="mobile-drawer-link" style="background:#ea580c;color:#fff;justify-content:center;gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
        <span>View Cart</span>
      </a>
    </div>
  `;

  function openDrawer() {
    drawer.classList.add("active", "open");
    backdrop.classList.add("active", "open");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    drawer.classList.remove("active", "open");
    backdrop.classList.remove("active", "open");
    document.body.style.overflow = "";
  }

  toggleBtn.onclick = (e) => {
    e.preventDefault();
    if (typeof window.openAccountDrawer === "function") {
      window.openAccountDrawer();
    } else {
      openDrawer();
    }
  };
  backdrop.onclick = closeDrawer;
  const closeBtn = drawer.querySelector("#closeMobileDrawerBtn");
  if (closeBtn) closeBtn.onclick = closeDrawer;

  const mobAccLink = drawer.querySelector("#mobileDrawerAccountLink");
  if (mobAccLink) {
    mobAccLink.onclick = (e) => {
      e.preventDefault();
      closeDrawer();
      if (typeof window.openAccountDrawer === "function") {
        window.openAccountDrawer();
      }
    };
  }
}

function copyToClipboard(text, btnElement, successMsg) {
  if (!text) return;
  const val = String(text).trim();

  function onDone() {
    if (btnElement) {
      const orig = btnElement.innerHTML;
      btnElement.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> <span style="color:#22c55e; font-weight:700;">Copied!</span>`;
      setTimeout(() => { btnElement.innerHTML = orig; }, 2000);
    }
    showToast(successMsg || "Copied to clipboard!");
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(val).then(onDone).catch(() => {
      fallbackCopyExec(val, onDone);
    });
  } else {
    fallbackCopyExec(val, onDone);
  }
}

function fallbackCopyExec(text, cb) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = document.execCommand("copy");
    if (ok && cb) cb();
  } catch (e) {}
  document.body.removeChild(ta);
}

window.copyToClipboard = copyToClipboard;

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatAnnouncementLinks(text) {
  if (!text) return "";
  let str = String(text);
  
  if (/<a\s+/i.test(str)) {
    return str.replace(/<a\s+([^>]*)(?:target="[^"]*")?([^>]*)>/gi, '<a $1 target="_blank" rel="noopener noreferrer" $2 style="color:#c2410c !important; font-weight:600 !important; text-decoration:underline !important; cursor:pointer !important;">');
  }

  str = escapeHtml(str).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, linkText, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#c2410c !important; font-weight:600 !important; text-decoration:underline !important; cursor:pointer !important;">${linkText}</a>`;
  });

  str = str.replace(/(?:https?:\/\/|t\.me\/)[^\s<]+/g, (url) => {
    const fullUrl = url.startsWith("t.me/") ? `https://${url}` : url;
    return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" style="color:#c2410c !important; font-weight:600 !important; text-decoration:underline !important; cursor:pointer !important;">${url}</a>`;
  });

  return str;
}

async function loadGlobalAnnouncements() {
  try {
    const res = await fetch("/api/announcements");
    if (!res.ok) return;
    const data = await res.json();
    const activeAnns = Array.isArray(data.announcements) ? data.announcements : [];

    let bar = document.querySelector("#siteAnnouncementBar");
    
    if (activeAnns.length === 0) {
      if (bar) bar.style.display = "none";
      return;
    }

    if (!bar) {
      bar = document.createElement("div");
      bar.id = "siteAnnouncementBar";
      bar.className = "site-announcement-bar";
      document.body.prepend(bar);
    }

    const itemsHtml = activeAnns.map(ann => {
      const titleStr = ann.title ? `<span style="font-weight:600; margin-right:6px;">${formatAnnouncementLinks(ann.title)}</span>` : "";
      const bodyStr = formatAnnouncementLinks(ann.content || "");
      return `<div class="announcement-item" style="display:inline-block;">${titleStr}${bodyStr}</div>`;
    }).join(`<span class="announcement-sep" style="margin: 0 16px; opacity: 0.5;">•</span>`);

    bar.innerHTML = `<div class="site-announcement-content">${itemsHtml}</div>`;
    bar.style.display = "block";
  } catch (e) {
    console.error("Failed to load announcements:", e);
  }
}

async function initGlobalAccountHeader() {
  loadGlobalAnnouncements();
  try { initMobileDrawer(); } catch (e) {}

  const navUserBtn = document.querySelector("#navUserBtn");
  if (!navUserBtn) return;

  navUserBtn.removeAttribute("href");
  navUserBtn.style.cursor = "pointer";

  // Backdrop for slide-in Account Drawer
  let backdrop = document.querySelector("#accountDrawerBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "accountDrawerBackdrop";
    backdrop.className = "account-drawer-backdrop";
    document.body.appendChild(backdrop);
  }

  // Side-in Account Drawer container
  let drawer = document.querySelector("#accountSideDrawer");
  if (!drawer) {
    drawer = document.createElement("div");
    drawer.id = "accountSideDrawer";
    drawer.className = "account-side-drawer";
    document.body.appendChild(drawer);
  }

  function openAccountDrawer() {
    drawer.classList.add("active", "open");
    backdrop.classList.add("active", "open");
    navUserBtn.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeAccountDrawer() {
    drawer.classList.remove("active", "open");
    backdrop.classList.remove("active", "open");
    navUserBtn.classList.remove("active");
    document.body.style.overflow = "";
  }

  window.openAccountDrawer = openAccountDrawer;
  window.closeAccountDrawer = closeAccountDrawer;

  navUserBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (drawer.classList.contains("active")) {
      closeAccountDrawer();
    } else {
      openAccountDrawer();
    }
  };

  backdrop.onclick = closeAccountDrawer;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("active")) {
      closeAccountDrawer();
    }
  });

  let authData = null;
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      authData = await res.json();
    }
  } catch (err) {
    console.warn("Auth check error:", err);
  }

  if (authData && authData.authenticated) {
    const displayName = (authData.name && authData.name.trim()) ? authData.name.trim() : authData.email.split("@")[0];
    const balanceStr = `£${Number(authData.balance || 0).toFixed(2)}`;
    const initialLetter = (displayName[0] || "U").toUpperCase();
    const isStaffOrAdmin = authData.role === "ADMIN" || authData.role === "GOD" || authData.role === "STAFF";
    const roleText = isStaffOrAdmin ? "Admin" : "Member";

    const mobAccText = document.querySelector("#mobileDrawerAccountText");
    if (mobAccText) mobAccText.textContent = displayName;
    const mobBalText = document.querySelector("#mobileDrawerBalanceText");
    if (mobBalText) mobBalText.textContent = `Balance [${balanceStr}]`;

    drawer.innerHTML = `
      <div class="account-drawer-header">
        <h3 class="account-drawer-title">My Account</h3>
        <button type="button" class="account-drawer-close-btn" id="closeAccountDrawerBtn" aria-label="Close account menu">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="account-drawer-profile">
        <div class="account-drawer-avatar">${escapeHtml(initialLetter)}</div>
        <div class="account-drawer-profile-info">
          <div class="account-drawer-username">${escapeHtml(displayName)}</div>
          ${authData.name && authData.name.trim() ? `<div class="account-drawer-email-sub">${escapeHtml(authData.email)}</div>` : ''}
          <div class="account-drawer-role-badge">${roleText}</div>
        </div>
      </div>

      <div class="account-drawer-balance-card">
        <div class="account-drawer-balance-left">
          <div class="account-drawer-balance-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><circle cx="12" cy="14" r="1.5"/></svg>
          </div>
          <div class="account-drawer-balance-meta">
            <span class="account-drawer-balance-tag">BALANCE</span>
            <span class="account-drawer-balance-amount">${balanceStr}</span>
          </div>
        </div>
        <a href="/deposit.html" class="account-drawer-topup-btn">+ Top Up</a>
      </div>

      <div class="account-drawer-divider"></div>

      <nav class="account-drawer-nav">
        ${isStaffOrAdmin ? `
          <a href="/admin.html" class="account-drawer-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Dashboard</span>
          </a>
        ` : `
          <a href="/dashboard.html" class="account-drawer-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Dashboard</span>
          </a>
        `}
        <a href="/orders.html" class="account-drawer-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span>My Orders</span>
        </a>
        <a href="/deposit.html" class="account-drawer-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
          <span>Balance &amp; Top Up</span>
        </a>
        <a href="/support.html" class="account-drawer-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>Support</span>
        </a>
        <a href="/cart.html" class="account-drawer-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
          <span>Cart</span>
          <span class="account-drawer-cart-badge" data-cart-count>0</span>
        </a>
        <button type="button" class="account-drawer-logout-btn" id="accountDrawerLogoutBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>Log out</span>
        </button>
      </nav>
    `;

    const closeBtn = drawer.querySelector("#closeAccountDrawerBtn");
    if (closeBtn) closeBtn.onclick = closeAccountDrawer;

    const logoutBtn = drawer.querySelector("#accountDrawerLogoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        logoutBtn.disabled = true;
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        } catch (err) {
          window.location.reload();
        }
      };
    }
  } else {
    // Unauthenticated guest check: redirect to /login if on any non-login page
    const p = window.location.pathname.toLowerCase();
    if (!p.includes("login")) {
      const search = window.location.search || "";
      const target = (p === "/" || p === "/index.html" || p === "/index") ? "" : `?redirect=${encodeURIComponent(p + search)}`;
      window.location.href = `/login${target}`;
      return;
    }

    // Guest state (only shown if somehow drawer rendered on login page)
    drawer.innerHTML = `
      <div class="account-drawer-header">
        <h3 class="account-drawer-title">My Account</h3>
        <button type="button" class="account-drawer-close-btn" id="closeAccountDrawerBtn" aria-label="Close account menu">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="account-drawer-guest-card">
        <div class="account-drawer-guest-title">Welcome to Falcon Logs</div>
        <div class="account-drawer-guest-desc">Log in or create an account to access your instant logs, balance, and priority support.</div>
        <div class="account-drawer-guest-actions">
          <a href="/login.html" class="account-drawer-guest-btn primary">Log In</a>
          <a href="/login.html?tab=register" class="account-drawer-guest-btn secondary">Create Account</a>
        </div>
      </div>

      <div class="account-drawer-divider"></div>

      <nav class="account-drawer-nav">
        <a href="/orders.html" class="account-drawer-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span>My Orders</span>
        </a>
        <a href="/support.html" class="account-drawer-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>Support</span>
        </a>
        <a href="/cart.html" class="account-drawer-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
          <span>Cart</span>
          <span class="account-drawer-cart-badge" data-cart-count>0</span>
        </a>
      </nav>
    `;

    const closeBtn = drawer.querySelector("#closeAccountDrawerBtn");
    if (closeBtn) closeBtn.onclick = closeAccountDrawer;
  }

  drawer.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => {
      document.body.style.overflow = "";
    });
  });

  updateCartBadge();
}

// =========================================================
// EMBEDDED CRYPTO PAYMENT DRAWER MODAL
// =========================================================
let cryptoTimerInterval = null;
let cryptoPollInterval = null;

function openCryptoPaymentDrawer(data) {
  if (!data) return;
  const {
    payment_id,
    pay_address,
    pay_amount,
    pay_currency,
    coin,
    network,
    price_amount,
    expiration_seconds
  } = data;

  const coinUpper = String(coin || pay_currency || "BTC").toUpperCase();
  const netStr = network ? `${coinUpper} • ${network.toUpperCase()}` : `${coinUpper}`;
  const cryptoCode = String(pay_currency || coinUpper).toUpperCase();
  
  const coinKey = String(coin || pay_currency || "btc").toLowerCase();
  const coinImgHtml = `<img src="/icons/${coinKey.includes('usdt') ? 'usdt' : (coinKey.includes('usdc') ? 'usdc' : coinKey)}.svg" alt="${escapeHtml(coinUpper)}" width="36" height="36" class="payment-method-coin-img">`;

  // Clean old overlay if present
  let overlay = document.querySelector("#cryptoPaymentModalOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cryptoPaymentModalOverlay";
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
  }

  let remainingSecs = Number(expiration_seconds || 1200);

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  const qrAmountUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pay_currency + ':' + pay_address + '?amount=' + pay_amount)}`;
  const qrAddressUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(pay_address)}`;

  overlay.innerHTML = `
    <div class="crypto-invoice-card">
      <div class="crypto-invoice-header">
        <div class="crypto-invoice-coin-icon" style="background: transparent; display: flex; align-items: center; justify-content: center;">${coinImgHtml}</div>
        <div class="crypto-invoice-head-info">
          <div class="crypto-invoice-title">Pay with ${escapeHtml(coinUpper)}</div>
          <div class="crypto-invoice-subtitle">Send the exact amount. We detect it automatically on this payment address.</div>
        </div>
        <div class="crypto-invoice-timer" id="cryptoTimerLabel">${formatTime(remainingSecs)}</div>
      </div>

      <div class="crypto-invoice-status-bar">
        <span class="crypto-status-pulse-dot"></span>
        <span id="cryptoStatusText">Waiting for payment</span>
      </div>

      <div class="crypto-tab-switch-group">
        <button type="button" class="crypto-tab-btn active" id="cryptoTabWithAmount">With amount</button>
        <button type="button" class="crypto-tab-btn" id="cryptoTabWithoutAmount">Without amount</button>
      </div>

      <div class="crypto-qr-container">
        <img id="cryptoQrImg" src="${qrAmountUrl}" alt="Crypto QR Code" class="crypto-qr-img">
      </div>

      <div class="crypto-field-box">
        <div class="crypto-field-label">Amount to Send</div>
        <div class="crypto-field-row">
          <div class="crypto-field-value">${escapeHtml(String(pay_amount))} <span style="font-size:12px; color:rgba(255,255,255,0.6);">${cryptoCode}</span></div>
          <button type="button" class="crypto-copy-btn" id="cryptoCopyAmountBtn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
      </div>

      <div class="crypto-meta-info-grid">
        <div class="crypto-field-box">
          <div class="crypto-field-label">Network</div>
          <div style="font-size:13px; font-weight:700; color:#fff;">${escapeHtml(netStr)}</div>
        </div>
        <div class="crypto-field-box">
          <div class="crypto-field-label">Typical Speed</div>
          <div style="font-size:13px; font-weight:700; color:#fff;">~5-15 min</div>
        </div>
      </div>

      <div class="crypto-warning-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Send the requested amount <strong>${escapeHtml(String(pay_amount))} ${cryptoCode}</strong>. Payments of a different amount remain associated with this invoice and may need manual review.</span>
      </div>

      <div class="crypto-field-box">
        <div class="crypto-field-label">Wallet Address</div>
        <div class="crypto-field-row">
          <div class="crypto-field-value" style="font-size:12.5px; font-family:'JetBrains Mono', monospace;">${escapeHtml(pay_address)}</div>
          <button type="button" class="crypto-copy-btn" id="cryptoCopyAddressBtn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
      </div>
    </div>
  `;

  overlay.classList.add("active");

  // QR Toggle Listeners
  const qrImg = overlay.querySelector("#cryptoQrImg");
  const btnWith = overlay.querySelector("#cryptoTabWithAmount");
  const btnWithout = overlay.querySelector("#cryptoTabWithoutAmount");

  if (btnWith && btnWithout && qrImg) {
    btnWith.addEventListener("click", () => {
      btnWith.classList.add("active");
      btnWithout.classList.remove("active");
      qrImg.src = qrAmountUrl;
    });

    btnWithout.addEventListener("click", () => {
      btnWithout.classList.add("active");
      btnWith.classList.remove("active");
      qrImg.src = qrAddressUrl;
    });
  }

  // Copy Buttons
  const copyAmtBtn = overlay.querySelector("#cryptoCopyAmountBtn");
  if (copyAmtBtn) {
    copyAmtBtn.addEventListener("click", () => {
      copyToClipboard(String(pay_amount), copyAmtBtn, "Crypto amount copied to clipboard!");
    });
  }

  const copyAddrBtn = overlay.querySelector("#cryptoCopyAddressBtn");
  if (copyAddrBtn) {
    copyAddrBtn.addEventListener("click", () => {
      copyToClipboard(pay_address, copyAddrBtn, "Wallet address copied to clipboard!");
    });
  }

  // Countdown timer
  if (cryptoTimerInterval) clearInterval(cryptoTimerInterval);
  const timerLabel = overlay.querySelector("#cryptoTimerLabel");
  cryptoTimerInterval = setInterval(() => {
    remainingSecs--;
    if (timerLabel) timerLabel.textContent = formatTime(Math.max(0, remainingSecs));
    if (remainingSecs <= 0) {
      clearInterval(cryptoTimerInterval);
      const statusText = overlay.querySelector("#cryptoStatusText");
      if (statusText) statusText.textContent = "Invoice Expired";
    }
  }, 1000);

  // Status Polling Interval (every 4s)
  if (cryptoPollInterval) clearInterval(cryptoPollInterval);
  cryptoPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/nowpayments/status/${encodeURIComponent(payment_id)}`);
      const stData = await res.json();
      if (res.ok && stData.isPaid) {
        clearInterval(cryptoPollInterval);
        clearInterval(cryptoTimerInterval);
        const statusText = overlay.querySelector("#cryptoStatusText");
        if (statusText) statusText.textContent = "Payment Received! Processing...";
        if (typeof window.showToast === "function") window.showToast("Payment received successfully!");
        
        setTimeout(() => {
          overlay.classList.remove("active");
          if (stData.type === "topup") {
            window.location.href = "/dashboard.html";
          } else {
            window.location.href = stData.orderId ? `/orders.html?orderId=${stData.orderId}` : "/orders.html";
          }
        }, 1500);
      }
    } catch (e) {
      // Polling retry
    }
  }, 4000);

  // Close when clicking outside card
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("active");
      if (cryptoTimerInterval) clearInterval(cryptoTimerInterval);
      if (cryptoPollInterval) clearInterval(cryptoPollInterval);
    }
  };
}

function showMysterioAlert(opts) {
  let overlay = document.querySelector("#mysterioAlertModalOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "mysterioAlertModalOverlay";
    overlay.className = "mysterio-alert-modal-overlay";
    overlay.innerHTML = `
      <div class="mysterio-alert-modal-card">
        <div class="mysterio-alert-head">
          <div class="mysterio-alert-title-wrap">
            <div class="mysterio-alert-title" id="mysterioAlertTitle">Notice</div>
            <div class="mysterio-alert-subtitle" id="mysterioAlertSubtitle">Falcon Logs</div>
          </div>
        </div>
        <div class="mysterio-alert-body" id="mysterioAlertBody"></div>
        <button type="button" class="mysterio-alert-btn" id="mysterioAlertBtn">Got it</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const titleEl = overlay.querySelector("#mysterioAlertTitle");
  const subEl = overlay.querySelector("#mysterioAlertSubtitle");
  const bodyEl = overlay.querySelector("#mysterioAlertBody");
  const btnEl = overlay.querySelector("#mysterioAlertBtn");

  if (typeof opts === "string") {
    opts = { message: opts };
  }

  titleEl.textContent = opts.title || (opts.isMinimalError ? "Minimum Amount Required" : "Notice");
  subEl.textContent = opts.subtitle || (opts.isMinimalError ? "NOWPayments Requirement" : "Falcon Logs");

  if (opts.isMinimalError && (opts.gbpMin || opts.usdMin)) {
    const minVal = Number(opts.gbpMin || opts.usdMin || 0);
    const currVal = Number(opts.currentAmountGbp || opts.currentAmountUsd || 0);
    const diff = Math.max(0, minVal - currVal);
    bodyEl.innerHTML = `
      <div class="mysterio-alert-msg">${opts.error || opts.message || ''}</div>
      <div class="mysterio-alert-grid">
        <div class="mysterio-alert-row">
          <span class="mysterio-alert-label">Selected Coin</span>
          <span class="mysterio-alert-val">${opts.coinSymbol || 'Crypto'}</span>
        </div>
        <div class="mysterio-alert-row">
          <span class="mysterio-alert-label">Minimum Required</span>
          <span class="mysterio-alert-val" style="color: #fb923c; font-weight: 800;">£${minVal.toFixed(2)} GBP <span style="font-size:11px; opacity:0.65; font-weight:500;">(${opts.cryptoMin || ''} ${opts.coinSymbol || ''})</span></span>
        </div>
        <div class="mysterio-alert-row">
          <span class="mysterio-alert-label">Current Total</span>
          <span class="mysterio-alert-val">£${currVal.toFixed(2)} GBP</span>
        </div>
        ${diff > 0 ? `
        <div class="mysterio-alert-row">
          <span class="mysterio-alert-label">Amount Needed</span>
          <span class="mysterio-alert-val" style="color: #fbbf24; font-weight: 800;">+£${diff.toFixed(2)} GBP</span>
        </div>
        ` : ''}
      </div>
      <div class="mysterio-alert-tip">
        <strong>Recommendation:</strong> Add items to reach <strong>£${minVal.toFixed(2)} GBP</strong>, or select <strong>LTC/SOL</strong> for smaller order amounts.
      </div>
    `;
  } else {
    bodyEl.innerHTML = `<div class="mysterio-alert-msg">${opts.error || opts.message || opts.text || "An issue occurred."}</div>`;
  }

  overlay.classList.add("active");

  btnEl.onclick = function() {
    overlay.classList.remove("active");
  };
  overlay.onclick = function(e) {
    if (e.target === overlay) overlay.classList.remove("active");
  };
}

window.addToCartStorage = addToCartStorage;
window.updateCartBadge = updateCartBadge;
window.showToast = showToast;
window.getCart = getCart;
window.setCart = setCart;
window.initGlobalAccountHeader = initGlobalAccountHeader;
window.openCryptoPaymentDrawer = openCryptoPaymentDrawer;
window.showMysterioAlert = showMysterioAlert;
window.setGlobalParticlesActive = setGlobalParticlesActive;
window.initFalconGlobalParticlesEngine = initFalconGlobalParticlesEngine;

// =========================================================================
// FALCON GLOBAL BACKGROUND PARTICLES ENGINE (Rising Flame Embers)
// =========================================================================
let _falconParticlesCanvas = null;
let _falconParticlesCtx = null;
let _falconParticlesList = [];
let _falconParticlesRafId = null;
let _falconParticlesActive = false;
let _falconParticlesWidth = 0;
let _falconParticlesHeight = 0;

const FALCON_EMBER_COLORS = [
  { r: 234, g: 88, b: 12 },   // #ea580c (Falcon Primary Orange)
  { r: 249, g: 115, b: 22 },  // #f97316 (Vibrant Flame)
  { r: 251, g: 146, b: 60 },  // #fb923c (Bright Ember)
  { r: 253, g: 186, b: 116 }, // #fdba74 (Warm Light Amber)
  { r: 194, g: 65, b: 12 },   // #c2410c (Deep Molten Ember)
  { r: 254, g: 240, b: 138 }  // #fef08a (Spark Core Glow)
];

class FalconEmberParticle {
  constructor(initialRandomY = true) {
    this.reset(initialRandomY);
  }

  reset(initialRandomY = false) {
    const w = _falconParticlesWidth || window.innerWidth || 800;
    const h = _falconParticlesHeight || window.innerHeight || 600;
    this.x = Math.random() * w;
    this.y = initialRandomY ? Math.random() * h : h + 10 + Math.random() * 25;
    this.radius = Math.random() * 1.5 + 0.8; // 0.8px - 2.3px
    this.speedY = -(Math.random() * 0.65 + 0.35); // upwards float
    this.speedX = (Math.random() - 0.5) * 0.3; // gentle sway
    this.color = FALCON_EMBER_COLORS[Math.floor(Math.random() * FALCON_EMBER_COLORS.length)];
    this.baseAlpha = Math.random() * 0.4 + 0.25;
    this.alpha = this.baseAlpha;
    this.twinkleSpeed = Math.random() * 0.03 + 0.015;
    this.twinkleAngle = Math.random() * Math.PI * 2;
  }

  update() {
    this.y += this.speedY;
    this.x += this.speedX + Math.sin(this.twinkleAngle) * 0.25;
    this.twinkleAngle += this.twinkleSpeed;
    this.alpha = Math.max(0.08, this.baseAlpha + Math.sin(this.twinkleAngle) * 0.16);

    if (this.y < -15 || this.x < -25 || this.x > _falconParticlesWidth + 25) {
      this.reset(false);
    }
  }

  draw(ctx) {
    if (this.radius > 1.4) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${(this.alpha * 0.18).toFixed(3)})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.alpha.toFixed(3)})`;
    ctx.fill();
  }
}

function resizeFalconParticles() {
  if (!_falconParticlesCanvas || !_falconParticlesCtx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  _falconParticlesWidth = window.innerWidth;
  _falconParticlesHeight = window.innerHeight;
  _falconParticlesCanvas.width = Math.floor(_falconParticlesWidth * dpr);
  _falconParticlesCanvas.height = Math.floor(_falconParticlesHeight * dpr);
  _falconParticlesCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function animateFalconParticles() {
  if (!_falconParticlesActive || !_falconParticlesCtx) return;
  _falconParticlesCtx.clearRect(0, 0, _falconParticlesWidth, _falconParticlesHeight);
  for (let i = 0; i < _falconParticlesList.length; i++) {
    _falconParticlesList[i].update();
    _falconParticlesList[i].draw(_falconParticlesCtx);
  }
  _falconParticlesRafId = requestAnimationFrame(animateFalconParticles);
}

function setGlobalParticlesActive(enabled) {
  _falconParticlesActive = !!enabled;
  if (!_falconParticlesCanvas) {
    _falconParticlesCanvas = document.getElementById("particlesCanvas") || document.getElementById("falconGlobalParticlesCanvas");
  }
  if (!_falconParticlesCanvas) return;

  if (_falconParticlesActive) {
    _falconParticlesCanvas.style.display = "block";
    _falconParticlesCanvas.removeAttribute("hidden");
    if (!_falconParticlesRafId) {
      if (_falconParticlesList.length === 0) {
        const count = window.innerWidth < 768 ? 32 : 58;
        for (let i = 0; i < count; i++) {
          _falconParticlesList.push(new FalconEmberParticle(true));
        }
      }
      _falconParticlesRafId = requestAnimationFrame(animateFalconParticles);
    }
  } else {
    _falconParticlesCanvas.style.display = "none";
    _falconParticlesCanvas.setAttribute("hidden", "");
    if (_falconParticlesRafId) {
      cancelAnimationFrame(_falconParticlesRafId);
      _falconParticlesRafId = null;
    }
    if (_falconParticlesCtx) {
      _falconParticlesCtx.clearRect(0, 0, _falconParticlesWidth || window.innerWidth, _falconParticlesHeight || window.innerHeight);
    }
  }
}
window.setGlobalParticlesActive = setGlobalParticlesActive;

function initFalconGlobalParticlesEngine() {
  try {
    _falconParticlesCanvas = document.getElementById("particlesCanvas") || document.getElementById("falconGlobalParticlesCanvas");
    if (!_falconParticlesCanvas) {
      _falconParticlesCanvas = document.createElement("canvas");
      _falconParticlesCanvas.id = "falconGlobalParticlesCanvas";
      _falconParticlesCanvas.className = "falcon-global-particles";
      document.body.prepend(_falconParticlesCanvas);
    } else {
      if (!_falconParticlesCanvas.classList.contains("falcon-global-particles")) {
        _falconParticlesCanvas.classList.add("falcon-global-particles");
      }
    }

    _falconParticlesCtx = _falconParticlesCanvas.getContext("2d");
    resizeFalconParticles();

    const count = window.innerWidth < 768 ? 32 : 58;
    _falconParticlesList = [];
    for (let i = 0; i < count; i++) {
      _falconParticlesList.push(new FalconEmberParticle(true));
    }

    window.addEventListener("resize", () => {
      resizeFalconParticles();
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (_falconParticlesRafId) {
          cancelAnimationFrame(_falconParticlesRafId);
          _falconParticlesRafId = null;
        }
      } else if (_falconParticlesActive) {
        if (!_falconParticlesRafId) {
          _falconParticlesRafId = requestAnimationFrame(animateFalconParticles);
        }
      }
    });

    window.addEventListener("storage", (e) => {
      if (e.key === "falcon_particles_enabled") {
        const active = e.newValue !== "false";
        setGlobalParticlesActive(active);
        const adminToggle = document.getElementById("toggle-particles");
        if (adminToggle) {
          adminToggle.checked = active;
        }
      }
    });

    let isEnabled = true;
    const cachedPref = localStorage.getItem("falcon_particles_enabled");
    if (cachedPref === "false") {
      isEnabled = false;
    }

    setGlobalParticlesActive(isEnabled);

    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(settings => {
        if (settings && typeof settings.particlesEnabled === "boolean") {
          localStorage.setItem("falcon_particles_enabled", String(settings.particlesEnabled));
          setGlobalParticlesActive(settings.particlesEnabled);
          const adminToggle = document.getElementById("toggle-particles");
          if (adminToggle) {
            adminToggle.checked = settings.particlesEnabled;
          }
        }
      })
      .catch(() => {});
  } catch (err) {
    console.warn("Particles engine init notice:", err);
  }
}

function onFalconDomReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

onFalconDomReady(() => {
  updateCartBadge();
  initGlobalAccountHeader();
  initFalconGlobalParticlesEngine();
});
