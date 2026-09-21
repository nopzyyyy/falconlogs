// ── Shared utilities ──────────────────────────────────────────────────────────

// Hide initial loading overlay once page resources are ready
function hidePageLoader() {
  const el = document.getElementById('pageLoader');
  if (el) el.classList.add('hidden');
  document.documentElement.classList.remove('loader-active');
  document.body.classList.remove('loader-active');
}
if (document.readyState === 'complete') {
  hidePageLoader();
} else {
  window.addEventListener('load', hidePageLoader);
  // Hard fallback so a slow asset never strands users on a blank loader
  setTimeout(hidePageLoader, 4000);
}

function getCurrencySign() {
  const meta = document.querySelector('meta[name="currency-sign"]');
  return meta ? meta.content : '£';
}

// ── Custom select dropdowns ────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const wrapper = e.target.closest('.custom-select-wrapper');
  document.querySelectorAll('.custom-select-wrapper.open').forEach(el => {
    if (el !== wrapper) el.classList.remove('open');
  });
  if (wrapper) {
    wrapper.classList.toggle('open');
  }
});

document.addEventListener('click', (e) => {
  const option = e.target.closest('.custom-option');
  if (!option) return;
  const wrapper = option.closest('.custom-select-wrapper');
  const display = wrapper.querySelector('.custom-select-display');
  display.textContent = option.textContent;
  // Use the attribute presence (not its truthiness) so an explicit empty
  // data-value="" (e.g. "All Categories") survives as "" instead of being
  // replaced by the option label text.
  display.dataset.value = option.hasAttribute('data-value') ? option.dataset.value : option.textContent;
  // Sync price/stock/etc. from the chosen option (needed for FCA file qty limits).
  for (const key of Object.keys(display.dataset)) {
    if (!(key in option.dataset)) delete display.dataset[key];
  }
  for (const [key, val] of Object.entries(option.dataset)) {
    display.dataset[key] = val;
  }
  wrapper.classList.remove('open');
  wrapper.dispatchEvent(new Event('change', { bubbles: true }));
});

// ── Cart count ─────────────────────────────────────────────────────────────────

async function updateCartCount() {
  try {
    const r = await fetch('/api/cart/count');
    const d = await r.json();
    const el = document.getElementById('cartItemsCount');
    if (el) el.textContent = d.count || 0;
  } catch {}
}

if (document.getElementById('cartItemsCount')) updateCartCount();

function updateNavUnreadCount(count) {
  const el = document.getElementById('navNotifCount');
  if (!el) return;
  const n = parseInt(count, 10) || 0;
  if (n <= 0) {
    el.hidden = true;
    el.textContent = '0';
    return;
  }
  el.hidden = false;
  el.textContent = n > 99 ? '99+' : String(n);
}

async function refreshNavUnreadCount() {
  if (!document.getElementById('navNotifCount')) return;
  try {
    const r = await fetch('/api/notifications/unread-count');
    if (!r.ok) return;
    const d = await r.json();
    updateNavUnreadCount(d.count || 0);
  } catch {}
}

if (document.getElementById('navNotifCount')) refreshNavUnreadCount();

// ── Global Auth & Navbar State ────────────────────────────────────────────────
async function syncGlobalAuth() {
  try {
    const r = await fetch('/api/auth/me');
    if (r.ok) {
      const data = await r.json();
      if (data && (data.authenticated === true || data.user)) {
        window.IS_LOGGED_IN = true;
        const user = data.user || data;
        window.CURRENT_USER = user;
        document.body.classList.add('user-logged-in');
        document.body.classList.remove('user-logged-out');
        const guestActions = document.getElementById('navGuestActions');
        const authActions = document.getElementById('navAuthActions');
        if (guestActions) guestActions.style.setProperty('display', 'none', 'important');
        if (authActions) authActions.style.setProperty('display', 'flex', 'important');
        document.querySelectorAll('.nav-auth-only').forEach(el => {
          el.classList.add('auth-visible');
          el.style.removeProperty('display');
        });
        const balEl = document.getElementById('clientBalance');
        if (balEl) balEl.textContent = `£${Number(user.balance || 0).toFixed(2)}`;
        const acctName = document.getElementById('accountUsername');
        if (acctName) acctName.textContent = user.email ? user.email.split('@')[0] : (user.name || 'user');
        return user;
      }
    }
  } catch (_) {}
  window.IS_LOGGED_IN = false;
  document.body.classList.remove('user-logged-in');
  document.body.classList.add('user-logged-out');
  const guestActions = document.getElementById('navGuestActions');
  const authActions = document.getElementById('navAuthActions');
  if (guestActions) guestActions.style.setProperty('display', 'flex', 'important');
  if (authActions) authActions.style.setProperty('display', 'none', 'important');
  document.querySelectorAll('.nav-auth-only').forEach(el => {
    el.classList.remove('auth-visible');
    el.style.setProperty('display', 'none', 'important');
  });
  return null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncGlobalAuth);
} else {
  syncGlobalAuth();
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('#navLogoutBtn')) {
    e.preventDefault();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    window.location.href = '/login.html';
    return;
  }

  // Account dropdown toggle on mobile
  const acctToggle = e.target.closest('#navAccountDropdown');
  if (acctToggle) {
    if (window.innerWidth < 992) {
      e.preventDefault();
      const menu = acctToggle.closest('.dropdown')?.querySelector('.account-dropdown');
      if (menu) menu.classList.toggle('show');
    }
  } else if (!e.target.closest('.account-dropdown')) {
    if (window.innerWidth < 992) {
      document.querySelectorAll('.account-dropdown.show').forEach(m => m.classList.remove('show'));
    }
  }
});

// ── Back to top button ─────────────────────────────────────────────────────────

const backBtn = document.getElementById('btn-back-to-top');
if (backBtn) {
  window.addEventListener('scroll', () => {
    backBtn.style.display = window.scrollY > 300 ? 'inline-block' : 'none';
  });
  backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ── Toast notification ─────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const colors = { success: '#00b027', error: '#dc3545', info: '#28c0e6', warning: '#ffb007' };
  toast.style.cssText = `background:#212121;border-left:3px solid ${colors[type]||colors.info};padding:10px 16px;border-radius:5px;color:#fff;font-size:13px;max-width:300px;box-shadow:0 4px 12px rgba(0,0,0,.3);animation:slideIn .2s ease`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Fetch with JSON helper ─────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  // The admin router is mounted at a random URL slug, so admin-side callers
  // that still use the literal "/admin/..." path get transparently rewritten
  // to the dynamic prefix injected via `window.ADMIN_BASE`.
  if (window.ADMIN_BASE && typeof url === 'string' && url.startsWith('/admin/')) {
    url = window.ADMIN_BASE + url.slice(6);
  }
  // `X-Requested-With: fetch` is required by the admin CSRF guard. Cross-site
  // forms cannot set custom headers, so this header alone proves the request
  // came from same-origin JS (i.e. our own pages).
  const defaults = { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' } };
  const merged = { ...defaults, ...options, headers: { ...defaults.headers, ...options.headers } };
  // Don't auto-follow auth redirects into an HTML login page surfaces a clean
  // error instead of "Unexpected token '<'".
  merged.redirect = merged.redirect || 'manual';
  if (merged.body && typeof merged.body === 'object') merged.body = JSON.stringify(merged.body);
  const r = await fetch(url, merged);

  // Session expired / auth required → send to login and return after
  if (r.status === 401 || r.status === 0 || r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) {
    let loginUrl = '/auth/login';
    try { const j = await r.json(); if (j.loginUrl) loginUrl = j.loginUrl; } catch (_) {}
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    if (!loginUrl.includes('next=')) {
      loginUrl += (loginUrl.includes('?') ? '&' : '?') + `next=${next}`;
    }
    if (typeof showToast === 'function') showToast('Please sign in to continue', 'error');
    setTimeout(() => { window.location.href = loginUrl; }, 600);
    throw new Error('Please sign in to continue.');
  }

  // Guard against non-JSON bodies (e.g. an unexpected HTML error page)
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (!r.ok) throw new Error(`Request failed (${r.status})`);
    throw new Error('Unexpected non-JSON response from server.');
  }

  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data.error || 'Request failed');
    if (data.code) e.code = data.code;
    throw e;
  }
  return data;
}
