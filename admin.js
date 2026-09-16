// Global Context Fallbacks
var IS_GOD_MODE = typeof window.IS_GOD_MODE !== "undefined" ? window.IS_GOD_MODE : false;
var currentAdminUserId = typeof window.currentAdminUserId !== "undefined" ? window.currentAdminUserId : null;

// Verify admin/god session on load
(async function checkAdminAuth() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      window.location.replace("/login.html?redirect=/admin.html");
      return;
    }
    const user = await res.json();
    if (!user.authenticated || (user.role !== "ADMIN" && user.role !== "GOD")) {
      window.location.replace("/login.html?redirect=/admin.html");
    }
  } catch (e) {}
})();

const productGrid = document.querySelector("#adminProductsGrid");
const productSearch = document.querySelector("#adminProductSearch");
const usersRows = document.querySelector("#adminUsersRows");
const ordersList = document.querySelector("#adminOrdersList");
let adminProducts = [];
let adminUsersList = [];


function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatVariantName(name) {
  if (!name) return "";
  let varName = String(name).trim();
  varName = varName.replace(/(\d+(?:\.\d+)?)\s*\$/g, "£$1")
                   .replace(/\$\s*(\d+(?:\.\d+)?)/g, "£$1")
                   .replace(/(\d+(?:\.\d+)?)\s*£/g, "£$1");
  return varName;
}

// =========================================================================
// IN-SITE DIALOG HELPERS (replace native alert / confirm / prompt)
// =========================================================================
const _dialogIcons = {
  info: {
    color: "var(--green)",
    bg: "rgba(34,197,94,0.12)",
    svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
  },
  success: {
    color: "var(--green)",
    bg: "rgba(34,197,94,0.12)",
    svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  },
  warn: {
    color: "var(--red)",
    bg: "rgba(239,68,68,0.12)",
    svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>'
  }
};

function _getDlg() {
  return {
    modal: document.querySelector("#siteDialogModal"),
    title: document.querySelector("#siteDialogTitle"),
    message: document.querySelector("#siteDialogMessage"),
    icon: document.querySelector("#siteDialogIcon"),
    closeBtn: document.querySelector("#siteDialogCloseBtn"),
    cancelBtn: document.querySelector("#siteDialogCancelBtn"),
    confirmBtn: document.querySelector("#siteDialogConfirmBtn"),
    resolve: _dlg.resolve
  };
}

const _dlg = {
  get modal() { return document.querySelector("#siteDialogModal"); },
  get title() { return document.querySelector("#siteDialogTitle"); },
  get message() { return document.querySelector("#siteDialogMessage"); },
  get icon() { return document.querySelector("#siteDialogIcon"); },
  get closeBtn() { return document.querySelector("#siteDialogCloseBtn"); },
  get cancelBtn() { return document.querySelector("#siteDialogCancelBtn"); },
  get confirmBtn() { return document.querySelector("#siteDialogConfirmBtn"); },
  resolve: null
};

function _setDialogIcon(variant) {
  const ic = _dialogIcons[variant] || _dialogIcons.info;
  const icon = _dlg.icon;
  if (!icon) return;
  icon.style.background = ic.bg;
  icon.style.border = `1px solid ${ic.color}`;
  icon.style.color = ic.color;
  icon.innerHTML = ic.svg;
}

function _closeDialog(result) {
  _dlg.modal?.classList.remove("active");
  const r = _dlg.resolve;
  _dlg.resolve = null;
  if (r) r(result);
}

document.addEventListener("click", (e) => {
  if (e.target.closest("#siteDialogCloseBtn") || e.target.closest("#siteDialogCancelBtn")) {
    _closeDialog(false);
  } else if (e.target.closest("#siteDialogConfirmBtn")) {
    _closeDialog(true);
  } else if (e.target === _dlg.modal) {
    _closeDialog(false);
  }
});

// Promise-based alert. Usage: await siteAlert("message", { title, variant, okLabel })
function siteAlert(message, opts = {}) {
  return new Promise((resolve) => {
    _dlg.resolve = resolve;
    if (_dlg.title) _dlg.title.textContent = opts.title || "Notice";
    if (_dlg.message) _dlg.message.textContent = message;
    _setDialogIcon(opts.variant || "info");
    if (_dlg.cancelBtn) _dlg.cancelBtn.style.display = "none";
    if (_dlg.confirmBtn) {
      _dlg.confirmBtn.className = "pill-button";
      _dlg.confirmBtn.style.minWidth = "110px";
      _dlg.confirmBtn.textContent = opts.okLabel || "OK";
    }
    _dlg.modal?.classList.add("active");
    _dlg.confirmBtn?.focus();
  });
}

function siteToast(message, type = "success") {
  let container = document.querySelector("#adminToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "adminToastContainer";
    container.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:10px;pointer-events:none;";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const isSuccess = type === "success";
  const iconSvg = isSuccess 
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

  toast.innerHTML = `
    ${iconSvg}
    <span style="color:#ffffff;font-size:13px;font-weight:700;font-family:'Montserrat',sans-serif;">${escapeHtml(message)}</span>
  `;
  toast.style.cssText = `
    background:#120e0a;
    border:1px solid rgba(234, 88, 12,0.25);
    border-radius:8px;
    box-shadow:0 10px 30px rgba(0,0,0,0.85);
    padding:12px 18px;
    display:flex;
    align-items:center;
    gap:10px;
    transform:translateY(15px);
    opacity:0;
    transition:transform 0.22s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease;
    pointer-events:auto;
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.transform = "translateY(10px)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}
window.siteToast = siteToast;

// Promise-based confirm. Resolves true/false. Usage: if (await siteConfirm("msg", {...}))
function siteConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    _dlg.resolve = resolve;
    if (_dlg.title) _dlg.title.textContent = opts.title || "Please confirm";
    if (_dlg.message) _dlg.message.textContent = message;
    _setDialogIcon(opts.variant || "warn");
    if (_dlg.cancelBtn) {
      _dlg.cancelBtn.style.display = "";
      _dlg.cancelBtn.textContent = opts.cancelLabel || "Cancel";
    }
    if (_dlg.confirmBtn) {
      _dlg.confirmBtn.className = opts.danger === false ? "pill-button" : "pill-button danger";
      _dlg.confirmBtn.style.minWidth = "100px";
      _dlg.confirmBtn.textContent = opts.confirmLabel || "Confirm";
    }
    _dlg.modal?.classList.add("active");
    _dlg.confirmBtn?.focus();
  });
}

const _pmt = {
  get modal() { return document.querySelector("#sitePromptModal"); },
  get title() { return document.querySelector("#sitePromptTitle"); },
  get fieldsWrap() { return document.querySelector("#sitePromptFields"); },
  get form() { return document.querySelector("#sitePromptForm"); },
  get error() { return document.querySelector("#sitePromptError"); },
  get closeBtn() { return document.querySelector("#sitePromptCloseBtn"); },
  get cancelBtn() { return document.querySelector("#sitePromptCancelBtn"); },
  get submitBtn() { return document.querySelector("#sitePromptSubmitBtn"); },
  resolve: null,
  fields: []
};

function _closePrompt(result) {
  _pmt.modal?.classList.remove("active");
  const r = _pmt.resolve;
  _pmt.resolve = null;
  if (r) r(result);
}

document.addEventListener("click", (e) => {
  if (e.target.closest("#sitePromptCloseBtn") || e.target.closest("#sitePromptCancelBtn")) {
    _closePrompt(null);
  } else if (e.target === _pmt.modal) {
    _closePrompt(null);
  }
});

document.addEventListener("submit", (e) => {
  if (e.target && e.target.id === "sitePromptForm") {
    e.preventDefault();
    const values = {};
    for (const f of _pmt.fields) {
      const el = _pmt.fieldsWrap?.querySelector(`[data-field="${f.name}"]`);
      const v = el ? el.value : "";
      if (f.required && !String(v).trim()) {
        if (_pmt.error) {
          _pmt.error.textContent = `${f.label} is required.`;
          _pmt.error.style.display = "block";
        }
        if (el) el.focus();
        return;
      }
      values[f.name] = v;
    }
    _closePrompt(values);
  }
});


// Promise-based prompt with one or more fields.
// Usage: const v = await sitePrompt({ title, submitLabel, fields:[{name,label,value,type,placeholder,required,step}] })
//   resolves to { name: value, ... } on submit, or null if cancelled.
function sitePrompt(opts = {}) {
  return new Promise((resolve) => {
    _pmt.resolve = resolve;
    _pmt.fields = opts.fields || [];
    _pmt.title.textContent = opts.title || "Input";
    _pmt.error.style.display = "none";
    _pmt.submitBtn.textContent = opts.submitLabel || "Save";
    _pmt.fieldsWrap.innerHTML = _pmt.fields.map(f => `
      <div class="modal-form-group">
        <label>${escapeHtml(f.label || f.name)}${f.required ? ' <span style="color:var(--red);">*</span>' : ""}</label>
        <input type="${f.type || "text"}" data-field="${escapeHtml(f.name)}" class="modal-form-control"
               value="${escapeHtml(String(f.value ?? ""))}" placeholder="${escapeHtml(f.placeholder || "")}"
               ${f.type === "number" ? `step="${f.step || "any"}"` : ""} autocomplete="off">
      </div>
    `).join("");
    _pmt.modal.classList.add("active");
    const first = _pmt.fieldsWrap.querySelector("[data-field]");
    if (first) { first.focus(); if (first.select) first.select(); }
  });
}

function setStatus(message, isError = false) {
  // Status surface moved into Card Inventory sub-views; kept as no-op safety wrapper
  console.log(`[admin] ${message}`);
}

function renderSummary(_items) {
  // Replaced by the bases grid view — no-op
}

function productVariants(product) {
  return Array.isArray(product.variants) ? product.variants : [];
}

function variantStockCount(variant) {
  return Array.isArray(variant.stock) ? variant.stock.filter(item => !item.isSold).length : 0;
}

function productStockCount(product) {
  return productVariants(product).reduce((sum, variant) => sum + variantStockCount(variant), 0);
}

function productMinPrice(product) {
  const prices = productVariants(product).map(variant => Number(variant.price || 0)).filter(price => price >= 0);
  return prices.length ? Math.min(...prices) : 0;
}

window.handleAdminImgError = function(imgEl, fallbackText) {
  if (!imgEl || !imgEl.parentElement) return;
  imgEl.parentElement.innerHTML = `<div class="admin-product-fallback">${escapeHtml(fallbackText)}</div>`;
};

async function renderProducts() {
  const grid = document.querySelector("#adminProductsGrid");
  const searchInput = document.querySelector("#adminProductSearch");
  if (!grid) return;

  if (!adminProducts || adminProducts.length === 0) {
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        adminProducts = data.products || [];
      }
    } catch (e) {
      console.error("Failed to load products:", e);
    }
  }

  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
  const products = adminProducts.filter(product => (product.title || "").toLowerCase().includes(query));
  
  if (!products.length) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--muted); font-weight:700;">No products found.</p>';
    return;
  }

  grid.innerHTML = products.map(product => {
    const variantList = Array.isArray(product.variants) ? product.variants : [];
    const variantCount = variantList.length;
    const totalStock = variantList.reduce((sum, v) => sum + (Array.isArray(v.stock) ? v.stock.filter(s => s && !s.isSold).length : 0), 0);
    const fallbackTxt = escapeHtml((product.title || 'P').slice(0,2).toUpperCase());
    return `
    <article class="admin-product-card" style="${product.isHidden ? 'opacity: 0.55;' : ''}">
      <div class="admin-product-art">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" class="admin-product-img" onerror="window.handleAdminImgError(this, '${fallbackTxt}')">` : `<div class="admin-product-fallback">${fallbackTxt}</div>`}
      </div>
      <div class="admin-product-body">
        <h2>${escapeHtml(product.title)} ${product.isHidden ? '<span style="color:var(--danger); font-size:10.5px; font-weight:800;">(HIDDEN)</span>' : ''}</h2>
        <p>${variantCount} Variant${variantCount !== 1 ? 's' : ''} &middot; <span style="color:${totalStock > 0 ? '#4ade80' : '#f87171'}">${totalStock} in stock</span></p>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin: 4px 0;">
          <span class="modal-tag-pill">${escapeHtml(product.category || 'Other')}</span>
          ${product.tags ? `<span class="modal-tag-pill" style="color:rgba(255,255,255,0.6);">${escapeHtml(product.tags)}</span>` : ''}
        </div>
        ${IS_GOD_MODE ? "" : `<div class="admin-card-actions">
          <button type="button" onclick="window.editProductPrompt('${product.id}')">Manage</button>
          <button class="secondary" type="button" onclick="window.toggleHideProduct('${product.id}', this)">
            ${product.isHidden ? 'Show' : 'Hide'}
          </button>
          <button class="danger" type="button" onclick="window.deleteProduct('${product.id}', this)">Delete</button>
        </div>`}
      </div>
    </article>
  `;}).join("");
}

async function renderUsers(users) {
  const countEl = document.querySelector("#adminUserCount");
  const rows = document.querySelector("#adminUsersRows");
  if (!rows) return;

  if (!users || users.length === 0) {
    if (!adminUsersList || adminUsersList.length === 0) {
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const data = await res.json();
          adminUsersList = data.users || [];
        }
      } catch (e) {}
    }
    users = adminUsersList;
  }

  if (countEl) countEl.textContent = users.length;
  rows.innerHTML = users.map(user => {
    const isSelf = user.id === currentAdminUserId;
    const isGod = user.role === "GOD";
    const canToggleRole = !isSelf && !isGod && !IS_GOD_MODE;
    const canDelete = !isSelf && !isGod && !IS_GOD_MODE;
    
    return `
      <tr data-user-email="${escapeHtml(user.email)}">
        <td>${escapeHtml(user.email)}</td>
        <td>
          <span class="status-pill status-${user.role === 'ADMIN' ? 'completed' : (user.role === 'GOD' ? 'topup' : 'pending')}">
            ${escapeHtml(user.role)}
          </span>
        </td>
        <td>
          <strong style="font-family:'JetBrains Mono',monospace; color:var(--green); font-size:12px; font-weight:600;">£${Number(user.balance || 0).toFixed(2)}</strong>
          ${IS_GOD_MODE ? "" : `<button type="button" class="admin-btn" onclick="window.adjustUserBalance('${escapeHtml(user.email)}')">Adjust</button>`}
        </td>
        <td>${escapeHtml(String(user.createdAt).slice(0, 10))}</td>
        <td style="text-align:right;">
          ${canToggleRole ? `
            <button type="button" class="admin-btn" onclick="window.toggleUserRole('${user.id}', '${user.role === 'ADMIN' ? 'USER' : 'ADMIN'}')">
              ${user.role === 'ADMIN' ? 'Demote' : 'Promote Staff'}
            </button>
          ` : ""}
          ${canDelete ? `
            <button type="button" class="admin-btn danger-btn" style="margin-left:5px;" onclick="window.deleteUser('${user.id}')">
              Delete
            </button>
          ` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

let adminOrdersList = [];
const expandedAdminOrders = new Set();

function statusColor(status) {
  if (status === "COMPLETED") return "var(--green)";
  if (status === "WAITING_PAYMENT" || status === "CONFIRMING") return "var(--amber, #f59e0b)";
  if (status === "FAILED" || status === "EXPIRED") return "var(--red)";
  return "var(--muted)";
}

function statusLabel(status) {
  const labels = {
    COMPLETED: "Delivered",
    WAITING_PAYMENT: "Awaiting Payment",
    CONFIRMING: "Confirming",
    EXPIRED: "Expired",
    FAILED: "Failed"
  };
  return labels[status] || status;
}

function flattenAdminOrder(order) {
  const cards = [];
  const accounts = [];
  (order.items || []).forEach((item, itemIdx) => {
    if (item.type === "stock") {
      cards.push({
        idx: cards.length + 1,
        name: item.name,
        price: item.price,
        credentials: item.credentials || ""
      });
    } else {
      const lines = String(item.credentials || "").split(/\r?\n/).filter(Boolean);
      lines.forEach(line => {
        accounts.push({
          idx: accounts.length + 1,
          name: item.name,
          price: item.price,
          credentials: line,
          productKey: item.id
        });
      });
    }
  });
  return { cards, accounts };
}

window.adminCopy = function(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = "Copied!";
    btn.style.background = "var(--green)";
    btn.style.color = "#03200f";
    setTimeout(() => {
      btn.textContent = old;
      btn.style.background = "";
      btn.style.color = "";
    }, 1000);
  });
};

window.toggleAdminOrder = function(orderId) {
  if (expandedAdminOrders.has(orderId)) expandedAdminOrders.delete(orderId);
  else expandedAdminOrders.add(orderId);
  applyOrderFilter();
};

let adminOrdersAll = [];
let adminOrderQuery = "";

// Build a per-item "what was sold" summary (product/variant or card + quantity).
function orderItemsSummary(order) {
  return (order.items || []).map(it => {
    const qty = it.type === "stock"
      ? 1
      : (String(it.credentials || "").split(/\r?\n/).filter(Boolean).length || Number(it.quantity) || 1);
    return { type: it.type, name: it.name || "—", qty, price: Number(it.price || 0) };
  });
}

function orderMatchesQuery(order, q) {
  if (!q) return true;
  const hay = [
    order.id, order.userEmail, order.userId, order.status, order.paymentMethod,
    ...(order.items || []).map(i => i.name),
    ...(order.items || []).map(i => i.credentials)
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function renderRecentOrders(orders) {
  const tbody = document.querySelector("#recentOrdersRows");
  if (!tbody) return;

  const list = (orders || adminOrdersAll || []).slice(0, 8);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty" style="text-align:center; padding:24px; color:var(--muted); font-size:12px;">No recent orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(order => {
    const total = Number(order.total || order.amount || 0).toFixed(2);
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    const status = String(order.status || "COMPLETED").toUpperCase();
    const isPaid = status === "PAID" || status === "COMPLETED" || status === "FULFILLED" || status === "DELIVERED";
    const isPending = status === "WAITING_PAYMENT" || status === "PENDING" || status === "PROCESSING" || status === "CONFIRMING";
    const statusPillClass = isPaid ? "completed" : (isPending ? "pending" : "expired");
    const method = escapeHtml(order.paymentMethod || (order.provider ? String(order.provider).toUpperCase() : "Balance"));

    return `
      <tr style="cursor:pointer; transition:background 0.12s;" onclick="if(typeof window.openAdminOrderInfoModal==='function') window.openAdminOrderInfoModal('${order.id}');">
        <td>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span class="mono" style="font-size:11.5px; color:#fb923c; font-weight:600;">#${escapeHtml(String(order.id).slice(0, 10))}</span>
            ${order.userEmail ? `<small style="font-size:10px; color:rgba(255,255,255,0.4);">${escapeHtml(order.userEmail)}</small>` : ''}
          </div>
        </td>
        <td style="font-weight:600; color:#fff; font-size:12px;">£${total}</td>
        <td><span style="font-size:11px; color:rgba(255,255,255,0.65);">${method}</span></td>
        <td><span class="status-pill status-${statusPillClass}" style="font-size:9.5px;">${statusLabel(status)}</span></td>
        <td style="font-size:11px; color:rgba(255,255,255,0.55); white-space:nowrap;">${dateStr}</td>
      </tr>
    `;
  }).join("");
}

async function renderOrders(orders) {
  if (!orders || orders.length === 0) {
    if (!adminOrdersAll || adminOrdersAll.length === 0) {
      try {
        const res = await fetch("/api/admin/orders");
        if (res.ok) {
          const data = await res.json();
          adminOrdersAll = data.orders || [];
        }
      } catch (e) {}
    }
    orders = adminOrdersAll;
  }
  adminOrdersAll = orders || [];
  applyOrderFilter();
  renderRecentOrders(adminOrdersAll);
}

let activeAdminOrderRecord = null;

function applyOrderFilter() {
  const q = adminOrderQuery.trim().toLowerCase();
  const orders = adminOrdersAll.filter(o => orderMatchesQuery(o, q));
  adminOrdersList = orders;

  const countEl = document.querySelector("#adminOrderCount");
  if (countEl) countEl.textContent = q ? `${orders.length}/${adminOrdersAll.length}` : String(adminOrdersAll.length);

  const list = document.querySelector("#adminOrdersList");
  if (!list) return;

  if (!orders.length) {
    list.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 36px 18px; color: rgba(255,255,255,0.45); font-size: 13px;">${q ? "No orders match your search." : "No orders found."}</td></tr>`;
    return;
  }

  list.innerHTML = orders.map(order => {
    const firstItem = (order.items && order.items[0]) ? order.items[0] : null;
    let title = "Order";
    if (firstItem) {
      title = firstItem.name || firstItem.productTitle || "Product Item";
      if (order.items.length > 1) {
        title += ` (+${order.items.length - 1} more)`;
      }
    } else if (order.paymentMethod) {
      title = `${order.paymentMethod} Order`;
    }

    const paid = Number(order.total || order.amount || 0);
    const expected = Number(order.total || order.amount || 0);
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "—";
    
    const st = String(order.status || "COMPLETED").toUpperCase();
    let statusClass = "status-completed";
    if (st === "WAITING_PAYMENT" || st === "UNPAID" || st === "PENDING" || st === "PENDING_PAYMENT") statusClass = "status-pending";
    else if (st === "CONFIRMING" || st === "PROCESSING") statusClass = "status-confirming";
    else if (st === "EXPIRED" || st === "FAILED") statusClass = "status-expired";
    else if (st === "REFUNDED") statusClass = "status-refunded";

    return `
      <tr class="orders-row" onclick="window.openAdminOrderInfoModal('${order.id}')" style="cursor:pointer;">
        <td>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <strong style="font-family:'JetBrains Mono',monospace; color:#fb923c; font-size:12.5px; font-weight:600;">#${escapeHtml(String(order.id).slice(0, 12))}</strong>
            <span style="font-size:11px; color:rgba(255,255,255,0.5);">${escapeHtml(order.userEmail || order.userId || "anon")}</span>
          </div>
        </td>
        <td style="font-weight: 500; color: #ffffff; font-size:12px;">${escapeHtml(title)}</td>
        <td style="font-weight: 600; color: #4ade80; font-family:'JetBrains Mono',monospace; font-size:12px;">£${paid.toFixed(2)}</td>
        <td style="font-weight: 600; color: #ffffff; font-family:'JetBrains Mono',monospace; font-size:12px;">£${expected.toFixed(2)}</td>
        <td><span class="${statusClass}">${escapeHtml(statusLabel(order.status))}</span></td>
        <td style="color: rgba(255,255,255,0.55); font-size: 11.5px; white-space:nowrap;">${dateStr}</td>
      </tr>
    `;
  }).join("");
}

window.openAdminOrderInfoModal = function(orderId) {
  const order = adminOrdersAll.find(o => o.id === orderId);
  if (!order) return;
  activeAdminOrderRecord = order;

  const overlay = document.querySelector("#orderInfoModalOverlay");
  if (!overlay) return;

  document.querySelector("#tabOrderInfo")?.classList.add("active");
  document.querySelector("#tabOrderProducts")?.classList.remove("active");
  document.querySelector("#orderInfoTabContent").style.display = "block";
  document.querySelector("#orderProductsTabContent").style.display = "none";
  document.querySelector("#orderStockSubView").style.display = "none";

  document.querySelector("#modalOrderId").textContent = order.id;
  document.querySelector("#modalOrderUser").textContent = order.userEmail || order.userId || "anon";
  document.querySelector("#modalOrderDate").textContent = order.createdAt ? new Date(order.createdAt).toLocaleString() : "—";
  document.querySelector("#modalOrderReason").textContent = order.paymentMethod || "cart";
  document.querySelector("#modalOrderExpected").textContent = `£${Number(order.total || 0).toFixed(2)}`;
  document.querySelector("#modalOrderPaid").textContent = `£${Number(order.total || 0).toFixed(2)}`;
  
  const statusEl = document.querySelector("#modalOrderStatus");
  if (statusEl) {
    statusEl.textContent = statusLabel(order.status);
    statusEl.style.color = statusColor(order.status);
  }

  const items = order.items || [];
  const hasLogs = items.some(i => i.credentials && i.credentials !== "Awaiting custom setup and delivery by administrator.");
  document.querySelector("#modalOrderLogs").textContent = hasLogs ? `${items.length} items with credentials` : "no log";

  const forceBtn = document.querySelector("#modalForceCompleteBtn");
  if (forceBtn) {
    forceBtn.style.display = (order.status !== "COMPLETED" && !IS_GOD_MODE) ? "block" : "none";
    forceBtn.onclick = () => { window.forceCompleteOrder(order.id); overlay.classList.remove("active"); };
  }

  const copyBtn = document.querySelector("#modalCopyOrderIdBtn");
  if (copyBtn) {
    copyBtn.onclick = () => { window.adminCopy(order.id, copyBtn); };
  }

  // Render PRODUCTS tab
  const productsListEl = document.querySelector("#modalProductsList");
  if (productsListEl) {
    if (items.length === 0) {
      productsListEl.innerHTML = `<div class="order-product-item-card"><div class="order-field-label">Type</div><div class="order-field-value">${escapeHtml(order.id)}</div></div>`;
    } else {
      productsListEl.innerHTML = items.map((item, idx) => {
        const prodTitle = item.name || item.productTitle || "Product";
        const varName = item.variantName || "-";
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.price || 0);
        const totalPrice = unitPrice * qty;

        return `
          <div class="order-product-item-card">
            <div>
              <div class="order-field-label">Product</div>
              <div class="order-field-value">${escapeHtml(prodTitle)}</div>
            </div>
            <div>
              <div class="order-field-label">Option</div>
              <div class="order-field-value">${escapeHtml(varName)}</div>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px;">
              <div>
                <div class="order-field-label">Quantity</div>
                <div class="order-field-value">${qty}</div>
              </div>
              <div>
                <div class="order-field-label">Unit price</div>
                <div class="order-field-value">£${unitPrice.toFixed(2)}</div>
              </div>
              <div>
                <div class="order-field-label">Total</div>
                <div class="order-field-value" style="color: #fb923c;">£${totalPrice.toFixed(2)}</div>
              </div>
            </div>
            ${item.credentials ? `
              <button type="button" class="pill-button" style="height: 38px; background: #ea580c; color: #fff; font-weight: 600; font-size: 12.5px; border-radius: 6px; border: none; cursor: pointer; margin-top: 8px;" onclick="window.viewAdminItemStock(${idx})">
                View stock
              </button>
            ` : ''}
          </div>
        `;
      }).join("");
    }
  }

  overlay.classList.add("active");
};

window.viewAdminItemStock = function(itemIdx) {
  if (!activeAdminOrderRecord || !activeAdminOrderRecord.items) return;
  const item = activeAdminOrderRecord.items[itemIdx];
  if (!item || !item.credentials) return;

  document.querySelector("#orderModalTabsBar").style.display = "none";
  document.querySelector("#orderInfoTabContent").style.display = "none";
  document.querySelector("#orderProductsTabContent").style.display = "none";
  const subView = document.querySelector("#orderStockSubView");
  subView.style.display = "block";

  const credsBox = document.querySelector("#modalStockCredentialsBox");
  if (credsBox) credsBox.value = item.credentials;
};

// Modal Events
document.querySelector("#closeOrderInfoModal")?.addEventListener("click", () => {
  document.querySelector("#orderInfoModalOverlay")?.classList.remove("active");
});
document.querySelector("#orderInfoModalOverlay")?.addEventListener("click", (e) => {
  if (e.target.id === "orderInfoModalOverlay") {
    document.querySelector("#orderInfoModalOverlay")?.classList.remove("active");
  }
});
document.querySelector("#tabOrderInfo")?.addEventListener("click", () => {
  document.querySelector("#tabOrderInfo")?.classList.add("active");
  document.querySelector("#tabOrderProducts")?.classList.remove("active");
  document.querySelector("#orderInfoTabContent").style.display = "block";
  document.querySelector("#orderProductsTabContent").style.display = "none";
  document.querySelector("#orderStockSubView").style.display = "none";
});
document.querySelector("#tabOrderProducts")?.addEventListener("click", () => {
  document.querySelector("#tabOrderInfo")?.classList.remove("active");
  document.querySelector("#tabOrderProducts")?.classList.add("active");
  document.querySelector("#orderInfoTabContent").style.display = "none";
  document.querySelector("#orderProductsTabContent").style.display = "block";
  document.querySelector("#orderStockSubView").style.display = "none";
});
document.querySelector("#modalStockBackBtn")?.addEventListener("click", () => {
  document.querySelector("#orderModalTabsBar").style.display = "flex";
  document.querySelector("#tabOrderProducts")?.click();
});
document.querySelector("#modalCopyStockBtn")?.addEventListener("click", () => {
  const credsBox = document.querySelector("#modalStockCredentialsBox");
  if (credsBox && credsBox.value) {
    window.adminCopy(credsBox.value, document.querySelector("#modalCopyStockBtn"));
  }
});

// Wire the orders search box (filters as you type)
const adminOrderSearchInput = document.querySelector("#adminOrderSearch");
if (adminOrderSearchInput) {
  adminOrderSearchInput?.addEventListener("input", () => {
    adminOrderQuery = adminOrderSearchInput.value || "";
    applyOrderFilter();
  });
}

// Copy a specific delivered item directly to clipboard
window.copyAdminItem = function(orderId, kind, idx) {
  const order = adminOrdersList.find(o => o.id === orderId);
  if (!order) return;
  const { cards, accounts } = flattenAdminOrder(order);
  const item = kind === "card" ? cards[idx] : accounts[idx];
  if (!item) return;
  navigator.clipboard.writeText(item.credentials).then(() => {
    // Quick toast on the clicked chip
    const chips = document.querySelectorAll(`[onclick*="${orderId}"][onclick*="${kind}"][onclick*="${idx}"]`);
    chips.forEach(c => {
      const old = c.innerHTML;
      c.innerHTML = "✓ Copied";
      c.style.background = "var(--green)";
      c.style.color = "#03200f";
      setTimeout(() => { c.innerHTML = old; c.style.background = ""; c.style.color = ""; }, 900);
    });
  });
};

async function refreshStock() {
  const response = await fetch("/api/items");
  const data = await response.json();
  renderSummary(data.items || []);
}

// =========================================================================
// CATEGORIES
// =========================================================================
const AVAILABLE_ICONS = [
  { id: "restaurant", label: "Food (restaurant)" },
  { id: "hotel", label: "Hotels (hotel)" },
  { id: "flight", label: "Flights (flight)" },
  { id: "card_giftcard", label: "Giftcards (giftcard)" },
  { id: "shopping_bag", label: "Shopping (bag)" },
  { id: "shopping_cart", label: "Groceries (cart)" },
  { id: "beach_access", label: "Lifestyle (beach)" },
  { id: "confirmation_number", label: "Tickets (ticket)" },
  { id: "local_gas_station", label: "Gas (gas)" },
  { id: "checkroom", label: "Clothing (hanger)" },
  { id: "home", label: "Rentals (home)" },
  { id: "play_circle_outline", label: "Streaming (play)" },
  { id: "movie", label: "Cinema (movie)" },
  { id: "directions_car", label: "Carparts (car)" },
  { id: "workspace_premium", label: "Jewelry (star)" },
  { id: "mail", label: "Email Bomber (mail)" },
  { id: "grid_view", label: "Grid (dashboard)" },
  { id: "folder", label: "Folder" },
  { id: "star", label: "Star" },
  { id: "settings", label: "Settings" },
  { id: "person", label: "Person" },
  { id: "vpn_key", label: "Key" },
  { id: "credit_card", label: "Credit Card" },
  { id: "shield", label: "Shield" },
  { id: "build", label: "Build" },
  { id: "cloud", label: "Cloud" },
  { id: "dns", label: "DNS" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "chat", label: "Chat" },
  { id: "terminal", label: "Terminal" },
  { id: "headset_mic", label: "Support" },
  { id: "lock", label: "Lock" },
  { id: "help_outline", label: "Help" }
];

let adminCategories = [];

function initIconDropdowns() {
  const selTab = document.querySelector("#newCategoryIconTab");
  const selModal = document.querySelector("#newCategoryIcon");
  
  const optionsHtml = AVAILABLE_ICONS.map(i => 
    `<option value="${escapeHtml(i.id)}">${escapeHtml(i.label || i.id)}</option>`
  ).join("");
  
  if (selTab) selTab.innerHTML = optionsHtml;
  if (selModal) selModal.innerHTML = optionsHtml;
}

function populateCategorySelect(currentValue) {
  const sel = document.querySelector("#productCategory");
  if (!sel) return;
  sel.innerHTML = adminCategories.map(c => {
    const name = c.name || c;
    return `<option value="${escapeHtml(name)}"${name === currentValue ? " selected" : ""}>${escapeHtml(name)}</option>`;
  }).join("") || `<option value="">No categories yet</option>`;
  if (currentValue) sel.value = currentValue;
}

function renderCategories() {
  const list = document.querySelector("#categoriesList");
  if (!list) return;
  if (adminCategories.length === 0) {
    list.innerHTML = `<p style="font-size:13px; color:var(--muted);">No categories yet. Add one above.</p>`;
    return;
  }
  list.innerHTML = adminCategories.map(cat => {
    const name = cat.name || cat;
    const icon = cat.icon || "folder";
    return `
      <div style="display:inline-flex; align-items:center; gap:8px; background:var(--bg-deep); border:1px solid var(--line); border-radius:6px; padding:6px 12px; font-size:13px;">
        <span class="material-icons" style="font-size:16px; color:var(--muted);">${escapeHtml(icon)}</span>
        <span>${escapeHtml(name)}</span>
        <button type="button" onclick="window.deleteCategory('${escapeHtml(name)}')" style="background:none; border:none; color:var(--red); cursor:pointer; padding:0; line-height:1; font-size:16px;" title="Remove">&times;</button>
      </div>
    `;
  }).join("");
}

async function loadCategories() {
  try {
    const res = await fetch("/api/categories");
    const data = await res.json();
    adminCategories = data.categories || [];
    renderCategories();
    initIconDropdowns();
  } catch {}
}

window.deleteCategory = async function(name) {
  if (!(await siteConfirm(`Remove category "${name}"? Products keep their data but lose this tab.`, { title: "Remove category", confirmLabel: "Remove" }))) return;
  const res = await fetch("/api/admin/categories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (!res.ok) return siteAlert(data.error || "Failed to delete category.", { variant: "warn", title: "Error" });
  adminCategories = data.categories || [];
  renderCategories();
  populateCategorySelect();
};

document?.addEventListener("click", (e) => {
  if (e.target.closest("#manageCategoriesBtn")) {
    loadCategories();
    document.getElementById("categoryAddStatus").textContent = "";
    document.getElementById("newCategoryInput").value = "";
    document.getElementById("categoriesModalOverlay").classList.add("active");
    return;
  }
  if (e.target.closest("#closeCategoriesModal")) {
    document.getElementById("categoriesModalOverlay").classList.remove("active");
    return;
  }
  if (e.target.id === "categoriesModalOverlay") {
    e.target.classList.remove("active");
    return;
  }
});

document?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement?.id === "newCategoryInput") {
    document.getElementById("addCategoryBtn")?.click();
  }
});

document.querySelector("#addCategoryBtn")?.addEventListener("click", async () => {
  const input = document.querySelector("#newCategoryInput");
  const status = document.querySelector("#categoryAddStatus");
  const iconSelect = document.querySelector("#newCategoryIcon");
  const name = input.value.trim();
  const icon = iconSelect ? iconSelect.value : "restaurant";
  if (!name) return;
  const res = await fetch("/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, icon })
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || "Failed.";
    status.style.color = "var(--red)";
    return;
  }
  adminCategories = data.categories || [];
  renderCategories();
  populateCategorySelect();
  input.value = "";
  status.textContent = `"${name}" added.`;
  status.style.color = "var(--green)";
  setTimeout(() => { status.textContent = ""; }, 2000);
});

async function loadAnalyticsStats() {
  try {
    const res = await fetch("/api/admin/stats");
    if (!res.ok) return;
    const stats = await res.json();

    const fmtMoney = v => `£${Number(v || 0).toFixed(2)}`;

    // Top 12 KPI Cards
    if (document.querySelector("#kpiUsersCount")) document.querySelector("#kpiUsersCount").textContent = stats.totalUsers ?? 0;
    if (document.querySelector("#kpiProductsCount")) document.querySelector("#kpiProductsCount").textContent = stats.totalProducts ?? 0;
    if (document.querySelector("#kpiFulfilledCount")) document.querySelector("#kpiFulfilledCount").textContent = `${stats.fulfilledOrders ?? 0}/${stats.totalOrders ?? 0}`;
    if (document.querySelector("#kpiTotalRevenue")) document.querySelector("#kpiTotalRevenue").textContent = fmtMoney(stats.totalRevenue);
    if (document.querySelector("#kpiTodayRevenue")) document.querySelector("#kpiTodayRevenue").textContent = fmtMoney(stats.todayRevenue);
    if (document.querySelector("#kpiRevenue7D")) document.querySelector("#kpiRevenue7D").textContent = fmtMoney(stats.revenue7D);
    if (document.querySelector("#kpiRevenue30D")) document.querySelector("#kpiRevenue30D").textContent = fmtMoney(stats.revenue30D);
    if (document.querySelector("#kpiNewUsersToday")) document.querySelector("#kpiNewUsersToday").textContent = stats.newUsersToday ?? 0;
    if (document.querySelector("#kpiPendingCount")) document.querySelector("#kpiPendingCount").textContent = stats.pendingOrders ?? 0;
    if (document.querySelector("#kpiOpenTickets")) document.querySelector("#kpiOpenTickets").textContent = stats.openTickets ?? 0;
    if (document.querySelector("#kpiTotalWalletBalance")) document.querySelector("#kpiTotalWalletBalance").textContent = fmtMoney(stats.totalWalletBalance);
    if (document.querySelector("#kpiOnlineNow")) document.querySelector("#kpiOnlineNow").textContent = stats.onlineNow ?? 1;
    if (document.querySelector("#kpiOnlineSub")) document.querySelector("#kpiOnlineSub").textContent = `ONLINE NOW - ${stats.onlineUsers || 1} in - ${stats.onlineGuests || 0} guests`;

    // Alert Row
    if (document.querySelector("#kpiLowStock")) document.querySelector("#kpiLowStock").textContent = stats.lowStockCount ?? 0;
    if (document.querySelector("#kpiBannedUsers")) document.querySelector("#kpiBannedUsers").textContent = stats.bannedUsers ?? 0;
    if (document.querySelector("#kpiAvgOrder")) document.querySelector("#kpiAvgOrder").textContent = fmtMoney(stats.avgOrderValue);

    // Server Status Health Box
    if (stats.serverStatus) {
      const s = stats.serverStatus;
      if (document.querySelector("#srvUptime")) document.querySelector("#srvUptime").textContent = s.uptime || "0m";
      if (document.querySelector("#srvDbLatency")) document.querySelector("#srvDbLatency").textContent = s.dbLatency || "<1 ms";
      if (document.querySelector("#srvApiLatency")) document.querySelector("#srvApiLatency").textContent = s.apiLatency || "24 ms";
      if (document.querySelector("#srvMemory")) document.querySelector("#srvMemory").textContent = s.memory || "0 MB";
      if (document.querySelector("#srvMemorySub")) document.querySelector("#srvMemorySub").textContent = s.memorySub || "";
      if (document.querySelector("#srvCpuLoad")) document.querySelector("#srvCpuLoad").textContent = s.cpuLoad || "0.04";
      if (document.querySelector("#srvDisk")) document.querySelector("#srvDisk").textContent = s.disk || "8%";
      if (document.querySelector("#srvDiskSub")) document.querySelector("#srvDiskSub").textContent = s.diskSub || "";
      if (document.querySelector("#srvDatabase")) document.querySelector("#srvDatabase").textContent = s.database || "OK";
      if (document.querySelector("#srvOnlineNow")) document.querySelector("#srvOnlineNow").textContent = s.onlineNow || "1 in";
      if (document.querySelector("#srvOnlineSub")) document.querySelector("#srvOnlineSub").textContent = s.onlineSub || "";
      if (document.querySelector("#srvRuntime")) document.querySelector("#srvRuntime").textContent = s.runtime || "v20";
      if (document.querySelector("#srvRuntimeSub")) document.querySelector("#srvRuntimeSub").textContent = s.runtimeSub || "";
      if (document.querySelector("#srvStarted")) document.querySelector("#srvStarted").textContent = s.started || "";
      
      const now = new Date();
      if (document.querySelector("#srvUpdatedTime")) document.querySelector("#srvUpdatedTime").textContent = `Updated ${now.toLocaleTimeString("en-GB")}`;
    }

    // Render 14-Day Line Chart
    render14DayLineChart(stats.revenueChart || []);

    // Render Top Selling Products
    renderTopSellingProducts(stats.topProducts || []);

    // Render Recent Orders in Dashboard
    if (!adminOrdersAll || adminOrdersAll.length === 0) {
      try {
        const ordRes = await fetch("/api/admin/orders");
        if (ordRes.ok) {
          const ordData = await ordRes.json();
          adminOrdersAll = ordData.orders || [];
        }
      } catch (e) {}
    }
    renderRecentOrders(adminOrdersAll);

  } catch (err) {
    console.error("Failed to fetch admin stats:", err);
  }
}

function render14DayLineChart(chartData) {
  const skeleton = document.getElementById("chartSkeletonLoader");
  if (skeleton) skeleton.classList.remove("active");

  const canvas = document.getElementById("revenueLineChartCanvas");
  const tooltip = document.getElementById("chartTooltip");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const data = chartData && chartData.length > 0 ? chartData : [];
  const maxRev = Math.max(...data.map(d => d.revenue || 0), 10);
  const totalRev = data.reduce((sum, d) => sum + (d.revenue || 0), 0);

  const pill = document.getElementById("chart14DayTotal");
  if (pill) pill.textContent = `£${totalRev.toFixed(2)}`;

  if (data.length === 0) return;

  const points = data.map((d, index) => {
    const x = paddingLeft + (data.length > 1 ? (index / (data.length - 1)) * plotWidth : plotWidth / 2);
    const y = paddingTop + plotHeight - (maxRev > 0 ? (d.revenue / maxRev) * plotHeight : 0);
    return { x, y, date: d.date, fullDate: d.fullDate || d.date, revenue: d.revenue || 0 };
  });

  let hoveredIndex = -1;

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Grid lines & Y-axis labels
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = paddingTop + (i / 3) * plotHeight;
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "500 10px 'Montserrat', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const val = maxRev - (i / 3) * maxRev;
      ctx.fillText("£" + Math.round(val), paddingLeft - 6, y);
    }
    ctx.stroke();

    // X-axis labels
    points.forEach((p, index) => {
      if (index % 2 === 0 || index === points.length - 1) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "500 9.5px 'Montserrat', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(p.date, p.x, height - paddingBottom + 8);
      }
    });

    if (points.length < 2) return;

    // Gradient fill under the smooth curve
    const grad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + plotHeight);
    grad.addColorStop(0, "rgba(234, 88, 12, 0.35)");
    grad.addColorStop(1, "rgba(234, 88, 12, 0.0)");

    ctx.beginPath();
    ctx.moveTo(points[0].x, paddingTop + plotHeight);
    ctx.lineTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, p1.x, p1.y);
    }
    ctx.lineTo(points[points.length - 1].x, paddingTop + plotHeight);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Smooth Bezier Line Stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, p1.x, p1.y);
    }
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Hover effect dot & vertical line
    if (hoveredIndex >= 0 && hoveredIndex < points.length) {
      const p = points[hoveredIndex];

      // Vertical Guideline
      ctx.beginPath();
      ctx.strokeStyle = "rgba(96, 165, 250, 0.3)";
      ctx.setLineDash([3, 3]);
      ctx.moveTo(p.x, paddingTop);
      ctx.lineTo(p.x, paddingTop + plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer Glow Dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(234, 88, 12, 0.4)";
      ctx.fill();

      // Inner White Dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ea580c";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fill();
    }
  }

  draw();

  canvas.onmousemove = function(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    let closest = -1;
    let minDist = Infinity;

    points.forEach((p, idx) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) {
        minDist = dist;
        closest = idx;
      }
    });

    if (closest >= 0 && minDist < 25) {
      if (hoveredIndex !== closest) {
        hoveredIndex = closest;
        draw();
      }
      const p = points[closest];
      if (tooltip) {
        tooltip.style.display = "block";
        tooltip.style.left = `${p.x}px`;
        if (p.y < 40) {
          tooltip.style.top = `${p.y + 12}px`;
          tooltip.style.transform = "translate(-50%, 0%)";
        } else {
          tooltip.style.top = `${p.y}px`;
          tooltip.style.transform = "translate(-50%, -120%)";
        }
        tooltip.innerHTML = `<span style="opacity:0.6; font-size:9.5px; display:block;">${p.fullDate || p.date}</span>£${p.revenue.toFixed(2)}`;
      }
    } else {
      if (hoveredIndex !== -1) {
        hoveredIndex = -1;
        draw();
        if (tooltip) tooltip.style.display = "none";
      }
    }
  };

  canvas.onmouseleave = function() {
    hoveredIndex = -1;
    draw();
    if (tooltip) tooltip.style.display = "none";
  };
}

function renderTopSellingProducts(topList) {
  const container = document.getElementById("topSellingList");
  if (!container) return;

  if (!topList || topList.length === 0) {
    container.innerHTML = `<div class="empty-top-selling" style="color:var(--muted); font-size:12px;">No sales recorded yet.</div>`;
    return;
  }

  container.innerHTML = topList.map((item, idx) => `
    <div class="top-selling-item">
      <span class="top-selling-rank">#${idx + 1}</span>
      <div class="top-selling-info">
        <span class="top-selling-title">${escapeHtml(item.title)}</span>
        <span class="top-selling-meta">${item.soldCount} unit${item.soldCount === 1 ? '' : 's'} sold</span>
      </div>
      <strong class="top-selling-rev">£${Number(item.revenue || 0).toFixed(2)}</strong>
    </div>
  `).join("");
}

async function refreshAdminData() {
  try {
    const productsData = await fetch("/api/products").then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const usersData = await fetch("/api/admin/users").then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const ordersData = await fetch("/api/admin/orders").then(r => r.ok ? r.json() : {}).catch(() => ({}));

    adminProducts = productsData.products || [];
    adminUsersList = usersData.users || [];
    renderProducts();
    renderUsers(adminUsersList);
    renderOrders(ordersData.orders || []);

    await loadAnalyticsStats().catch(() => {});
    await loadCategories().catch(() => {});
  } catch (err) {
    console.error("refreshAdminData error:", err);
  }
}

function renderRevenueAnalytics(orders, topups) {
  loadAnalyticsStats();
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "View all →" jumps to the Orders tab
document?.addEventListener("click", e => {
  if (e.target.closest("#viewAllOrdersLink")) {
    e.preventDefault();
    const tab = document.querySelector('.admin-tab[data-admin-tab="orders"]');
    if (tab) tab.click();
  }
});

// Refund window selector
function getSelectedRefundWindow() {
  const checked = document.querySelector('input[name="refundWindow"]:checked');
  if (!checked) return 24;
  if (checked.value === "custom") {
    const v = Number(document.querySelector("#customRefundHoursInput").value);
    return v > 0 ? v : 24;
  }
  return Number(checked.value) || 24;
}
document?.addEventListener("change", e => {
  if (e.target.matches('input[name="refundWindow"]')) {
    const custom = document.querySelector("#customRefundHoursInput");
    if (!custom) return;
    if (e.target.value === "custom") { custom.style.display = "block"; custom.focus(); }
    else { custom.style.display = "none"; }
  }
});

// ---- Refunds tab ----
async function loadRefunds() {
  const list = document.querySelector("#refundsList");
  if (!list) return;
  try {
    const res = await fetch("/api/admin/refunds");
    const data = await res.json();
    const refunds = data.refunds || [];
    if (refunds.length === 0) {
      list.innerHTML = `<div class="empty-store">No refund requests yet.</div>`;
      return;
    }
    list.innerHTML = refunds.map(r => {
      const statusCls = r.status === "APPROVED" ? "approved" : (r.status === "DENIED" ? "denied" : "pending");
      const shots = (r.screenshots || []).map(f => `<a href="/screenshots/${escapeHtml(f)}" target="_blank" rel="noopener" class="refund-shot-thumb"><img src="/screenshots/${escapeHtml(f)}" alt=""></a>`).join("");
      const canAct = r.status === "PENDING";
      return `
        <article class="refund-card refund-${statusCls}">
          <div class="refund-card-head">
            <div>
              <strong class="refund-id">${escapeHtml(r.id)}</strong>
              <span class="refund-status status-${statusCls}">${escapeHtml(r.status)}</span>
            </div>
            <strong class="refund-amount">£${Number(r.price || 0).toFixed(2)}</strong>
          </div>
          <div class="refund-meta">
            <div><span>User:</span> ${escapeHtml(r.userEmail || "—")}</div>
            <div><span>Order:</span> <code>${escapeHtml(r.orderId)}</code></div>
            <div><span>Item:</span> ${escapeHtml(r.itemKind)} — ${escapeHtml(r.itemName)}</div>
            <div><span>Submitted:</span> ${new Date(r.createdAt).toLocaleString()}</div>
            ${r.resolvedAt ? `<div><span>Resolved:</span> ${new Date(r.resolvedAt).toLocaleString()} <em>(by ${escapeHtml(r.resolvedBy || "—")})</em></div>` : ""}
          </div>
          <div class="refund-credentials"><span>Credentials:</span> <code>${escapeHtml(String(r.itemCredentials || "").slice(0, 200))}${(r.itemCredentials || "").length > 200 ? "…" : ""}</code></div>
          <div class="refund-reason"><span>Reason:</span> ${escapeHtml(r.reason)}</div>
          ${shots ? `<div class="refund-shots">${shots}</div>` : ""}
          ${canAct && !IS_GOD_MODE ? `
            <div class="refund-actions">
              <button type="button" class="pill-button" data-refund-action="approve" data-refund-id="${escapeHtml(r.id)}">✓ Approve & Credit £${Number(r.price || 0).toFixed(2)}</button>
              <button type="button" class="ghost-cta danger" data-refund-action="deny" data-refund-id="${escapeHtml(r.id)}">Deny</button>
            </div>
          ` : ""}
        </article>
      `;
    }).join("");

    list.querySelectorAll("[data-refund-action]").forEach(btn => {
      btn?.addEventListener("click", async () => {
        const refundId = btn.dataset.refundId;
        const action = btn.dataset.refundAction;
        if (action === "deny" && !(await siteConfirm("Deny this refund request?", { title: "Deny refund", confirmLabel: "Deny" }))) return;
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = `<span class="spinner-sm"></span>`;
        try {
          const res = await fetch("/api/admin/refunds/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refundId, action })
          });
          const data = await res.json();
          if (!res.ok) { siteAlert(data.error || "Failed.", { variant: "warn", title: "Error" }); btn.disabled = false; btn.innerHTML = original; return; }
          loadRefunds();
        } catch {
          siteAlert("Network error.", { variant: "warn", title: "Error" });
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-store">Could not load refunds.</div>`;
  }
}

document?.addEventListener("click", (e) => {
  const tab = e.target.closest(".admin-tab[data-admin-tab]");
  if (!tab) return;

  document.querySelectorAll(".admin-tab").forEach(item => item.classList.remove("active"));
  document.querySelectorAll(".admin-section").forEach(section => section.classList.remove("active"));
  
  tab.classList.add("active");
  
  const targetSection = document.querySelector(`#admin-${tab.dataset.adminTab}`);
  if (targetSection) targetSection.classList.add("active");

  // Mobile Drawer Close & Title Update
  document.getElementById("adminSidebar")?.classList.remove("open");
  document.getElementById("adminMobileDrawerOverlay")?.classList.remove("active");
  const mobTitle = document.getElementById("mobileActiveTabTitle");
  if (mobTitle) {
    mobTitle.innerText = tab.querySelector("span")?.innerText || tab.dataset.adminTab;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector(".admin-main")?.scrollTo({ top: 0 });

  const t = tab.dataset.adminTab;
  try {
    if (t === "analytics") {
      loadAnalyticsStats();
    } else if (t === "products") {
      renderProducts();
    } else if (t === "orders") {
      renderOrders(adminOrdersAll);
    } else if (t === "users") {
      renderUsers(adminUsersList);
    } else if (t === "stock") {
      showBasesListView();
      loadBasesView();
    } else if (t === "categories") {
      if (typeof loadCategoriesTab === "function") loadCategoriesTab();
    } else if (t === "transactions") {
      if (typeof loadTransactionsTab === "function") loadTransactionsTab();
    } else if (t === "refunds") {
      if (typeof loadRefunds === "function") loadRefunds();
    } else if (t === "replacements") {
      if (typeof loadAdminReplacementTickets === "function") loadAdminReplacementTickets();
    } else if (t === "coupons") {
      if (typeof loadCouponsTab === "function") loadCouponsTab();
    } else if (t === "announcements") {
      if (typeof loadAnnouncementsTab === "function") loadAnnouncementsTab();
    } else if (t === "faq") {
      if (typeof loadFaqTab === "function") loadFaqTab();
    } else if (t === "pages") {
      if (typeof loadPagesTab === "function") loadPagesTab();
    } else if (t === "audit_log") {
      if (typeof loadAuditLogsTab === "function") loadAuditLogsTab();
    } else if (t === "settings") {
      if (typeof loadSettings === "function") loadSettings();
    }
  } catch (err) {
    console.error(`Tab loader error for ${t}:`, err);
  }
});

productSearch?.addEventListener("input", renderProducts);

document.querySelector("#logoutBtn")?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
});

function initAdminMobileAndStats() {
  // Mobile Drawer Navigation Toggles
  const menuToggle = document.getElementById("adminMobileMenuToggle");
  const sidebar = document.getElementById("adminSidebar");
  const overlay = document.getElementById("adminMobileDrawerOverlay");
  const closeBtn = document.getElementById("adminCloseDrawerBtn");

  menuToggle?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
  });
  closeBtn?.addEventListener("click", () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
  });
  overlay?.addEventListener("click", () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("active");
  });

  const ticketBackBtn = document.getElementById("adminTicketBackToQueueBtn");
  ticketBackBtn?.addEventListener("click", () => {
    const layout = document.querySelector(".admin-replacements-layout");
    if (layout) layout.classList.remove("chat-view-active");
    showAdminChatPlaceholder();
  });

  document.querySelector("#refreshStatsBtn")?.addEventListener("click", async () => {
    const btn = document.querySelector("#refreshStatsBtn");
    if (btn) btn.textContent = "Refreshing...";
    await loadAnalyticsStats();
    if (btn) setTimeout(() => { btn.textContent = "Refresh"; }, 400);
  });

  // Load dashboard stats once on initial page load (no auto-polling, no auto-reloading)
  loadAnalyticsStats().catch(err => console.error("loadAnalyticsStats error:", err));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminMobileAndStats);
} else {
  initAdminMobileAndStats();
}

refreshAdminData().catch(err => console.error("refreshAdminData error:", err));
// Preload bases so the Card Inventory tab is instant when opened
loadBasesView().catch(err => console.error("loadBasesView error:", err));

// =========================================================================
// CREATE NEW BASE FLOW (fullz-format stock import)
// =========================================================================
const newBaseModalOverlay = document.querySelector("#newBaseModalOverlay");
const openNewBaseModalBtn = document.querySelector("#openNewBaseModalBtn");
const closeNewBaseModalBtn = document.querySelector("#closeNewBaseModalBtn");
const cancelNewBaseBtn = document.querySelector("#cancelNewBaseBtn");
const submitNewBaseBtn = document.querySelector("#submitNewBaseBtn");
const newBaseStatus = document.querySelector("#newBaseStatus");

function openNewBaseModal() {
  document.querySelector("#baseNameInput").value = "";
  document.querySelector("#basePriceInput").value = "2.00";
  document.querySelector("#baseStockInput").value = "";
  const refundCheckbox = document.querySelector("#baseRefundableInput");
  if (refundCheckbox) refundCheckbox.checked = true;
  const defaultWin = document.querySelector('input[name="refundWindow"][value="24"]');
  if (defaultWin) defaultWin.checked = true;
  const customField = document.querySelector("#customRefundHoursInput");
  if (customField) { customField.style.display = "none"; customField.value = ""; }
  newBaseStatus.textContent = "";
  newBaseStatus.style.color = "var(--muted)";
  newBaseModalOverlay.classList.add("active");
  setTimeout(() => document.querySelector("#baseNameInput").focus(), 50);
}

function closeNewBaseModal() {
  newBaseModalOverlay.classList.remove("active");
}

openNewBaseModalBtn?.addEventListener("click", openNewBaseModal);
closeNewBaseModalBtn?.addEventListener("click", closeNewBaseModal);
cancelNewBaseBtn?.addEventListener("click", closeNewBaseModal);
newBaseModalOverlay?.addEventListener("click", (e) => {
  if (e.target === newBaseModalOverlay) closeNewBaseModal();
});

// =========================================================================
// CARD INVENTORY — BASES GRID VIEW + BASE DETAIL VIEW
// =========================================================================
const basesListView = document.querySelector("#basesListView");
const baseDetailView = document.querySelector("#baseDetailView");
const basesGrid = document.querySelector("#basesGrid");
const baseDetailTitle = document.querySelector("#baseDetailTitle");
const baseDetailMeta = document.querySelector("#baseDetailMeta");
const baseDetailNameEcho = document.querySelector("#baseDetailNameEcho");
const baseDetailPasteInput = document.querySelector("#baseDetailPasteInput");
const baseDetailAppendBtn = document.querySelector("#baseDetailAppendBtn");
const baseDetailStockList = document.querySelector("#baseDetailStockList");
const baseDetailCountBadge = document.querySelector("#baseDetailCountBadge");
const baseDetailStatus = document.querySelector("#baseDetailStatus");
const backToBasesBtn = document.querySelector("#backToBasesBtn");
const deleteBaseBtn = document.querySelector("#deleteBaseBtn");
let allInventoryItems = [];
let activeBaseName = null;

// =========================================================================
// STOCK DOWNLOAD HELPERS
// =========================================================================
function downloadStockTxt(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadBaseStock(baseName) {
  const items = allInventoryItems.filter(i => String(i.base || "").trim() === baseName && !i.isSold);
  if (items.length === 0) {
    siteAlert("No available stock to download for this base.", { variant: "info", title: "Information" });
    return;
  }
  const fileContent = items.map(i => {
    if (i.pan) {
      return `${i.pan}|${i.mm || ""}|${i.yy || ""}|${i.cvv || ""}|${i.name || ""}|${i.address || ""}|${i.city || ""}|${i.state || ""}|${i.zip || ""}|${i.phone || ""}|${i.email || ""}`;
    }
    return `${i.bin} | ${i.type} | ${i.level} | ${i.issuer} | ${i.state} | ${i.zip} | ${i.country} | ${i.base} | ${i.billing} | ${i.price} | ${i.city}`;
  }).join("\r\n");

  const filename = `${baseName.replace(/[^a-z0-9_-]/gi, "_")}_available_stock.txt`;
  downloadStockTxt(fileContent, filename);
}

window.downloadVariantStock = function(productId, variantId) {
  const product = adminProducts.find(p => p.id === productId);
  const variant = productVariants(product).find(v => v.id === variantId);
  if (!product || !variant) return;

  const stock = variant.stock || [];
  const available = stock.filter(s => !s.isSold);
  if (available.length === 0) {
    siteAlert("No available stock to download for this variant.", { variant: "info", title: "Information" });
    return;
  }

  const fileContent = available.map(s => s.content).join("\r\n");
  const filename = `${product.title.replace(/[^a-z0-9_-]/gi, "_")}_${variant.name.replace(/[^a-z0-9_-]/gi, "_")}_available_stock.txt`;
  downloadStockTxt(fileContent, filename);
};

// Listeners for download buttons
document?.addEventListener("click", e => {
  if (e.target && e.target.closest("#downloadBaseStockBtn")) {
    if (activeBaseName) downloadBaseStock(activeBaseName);
  }
  if (e.target && e.target.closest("#stockDownloadAvailableBtn")) {
    if (activeProductId && activeVariantId) {
      window.downloadVariantStock(activeProductId, activeVariantId);
    }
  }
});

function showBasesListView() {
  const list = document.querySelector("#basesListView");
  const detail = document.querySelector("#baseDetailView");
  if (list) list.style.display = "";
  if (detail) detail.style.display = "none";
}
function showBaseDetailView() {
  const list = document.querySelector("#basesListView");
  const detail = document.querySelector("#baseDetailView");
  if (list) list.style.display = "none";
  if (detail) detail.style.display = "";
}

async function loadBasesView() {
  try {
    const res = await fetch("/api/items");
    const data = await res.json();
    allInventoryItems = data.items || [];
    renderBasesGrid();
    // If currently viewing a base, refresh its detail too
    if (activeBaseName) renderBaseDetail();
  } catch (e) {
    basesGrid.innerHTML = '<div class="empty-store">Could not load inventory.</div>';
  }
}

function groupByBase(items) {
  const groups = new Map();
  items.forEach(item => {
    const key = String(item.base || "—").trim() || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function renderBasesGrid() {
  const groups = groupByBase(allInventoryItems);
  if (groups.size === 0) {
    basesGrid.innerHTML = `
      <div class="empty-store" style="grid-column:1/-1; padding:60px 20px;">
        <p style="color:var(--muted); margin-bottom:14px;">No bases yet.</p>
        <p style="color:var(--muted); font-size:12px;">Click "Create New Base" above to add your first base.</p>
      </div>`;
    return;
  }

  const cards = [];
  groups.forEach((items, baseName) => {
    const unsold = items.filter(i => !i.isSold).length;
    const total = items.length;
    const sample = items[0] || {};
    const minPrice = Math.min(...items.map(i => Number(i.price || 0)));
    cards.push(`
      <button type="button" class="base-card" data-base-name="${escapeHtml(baseName)}">
        <div class="base-card-head">
          <div class="base-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div class="base-card-title">
            <strong>${escapeHtml(baseName)}</strong>
            <span>${escapeHtml(sample.type || "")} &middot; ${escapeHtml(sample.country || "—")}</span>
          </div>
        </div>
        <div class="base-card-stats">
          <div><span>In Stock</span><strong style="color:${unsold > 0 ? 'var(--green)' : 'var(--red)'};">${unsold}</strong></div>
          <div><span>Total</span><strong>${total}</strong></div>
          <div><span>Price</span><strong style="color:var(--green);">£${minPrice.toFixed(2)}</strong></div>
        </div>
      </button>
    `);
  });
  basesGrid.innerHTML = cards.join("");

  basesGrid.querySelectorAll("[data-base-name]").forEach(btn => {
    btn?.addEventListener("click", () => openBaseDetail(btn.dataset.baseName));
  });
}

function openBaseDetail(baseName) {
  activeBaseName = baseName;
  baseDetailTitle.textContent = baseName;
  baseDetailNameEcho.textContent = baseName;
  baseDetailPasteInput.value = "";
  baseDetailStatus.textContent = "";
  showBaseDetailView();
  renderBaseDetail();
}

function renderBaseDetail() {
  if (!activeBaseName) return;
  const items = allInventoryItems.filter(i => String(i.base || "").trim() === activeBaseName);
  const unsold = items.filter(i => !i.isSold).length;
  const sample = items[0] || {};

  baseDetailMeta.innerHTML = `
    <strong style="color:var(--green);">${unsold}</strong> in stock &middot;
    <strong>${items.length}</strong> total &middot;
    ${escapeHtml(sample.type || "—")} ${escapeHtml(sample.level || "")} &middot;
    ${escapeHtml(sample.country || "—")} &middot;
    £${Number(sample.price || 0).toFixed(2)}
  `;
  baseDetailCountBadge.textContent = `${items.length} card${items.length === 1 ? "" : "s"}`;

  if (items.length === 0) {
    baseDetailStockList.innerHTML = '<div class="empty-store" style="padding:30px 12px;">No cards under this base. Add some using the paste box on the left.</div>';
    return;
  }

  baseDetailStockList.innerHTML = items.map(item => {
    const binDisplay = String(item.bin || "").slice(0, 6);
    const soldBadge = item.isSold
      ? '<span class="ticket-status-badge status-dismissed">SOLD</span>'
      : '<span class="ticket-status-badge status-resolved">AVAILABLE</span>';
    return `
      <div class="stock-row">
        <div class="stock-row-main">
          <strong style="font-family:'JetBrains Mono', 'Consolas', monospace;">${escapeHtml(binDisplay)}••••••••••</strong>
          <span>${escapeHtml(item.state || "—")} ${escapeHtml(item.zip || "")} &middot; ${escapeHtml(item.city || "")}</span>
        </div>
        ${soldBadge}
        <button type="button" class="stock-row-del" data-item-id="${escapeHtml(item.id)}" title="Delete this card">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>
      </div>
    `;
  }).join("");

  baseDetailStockList.querySelectorAll("[data-item-id]").forEach(btn => {
    btn?.addEventListener("click", () => {
      const id = btn.dataset.itemId;
      const item = items.find(i => i.id === id);
      const label = item ? `${item.bin}•••••• (${item.state || "—"})` : "this card";
      openConfirmDelete(
        "Delete card?",
        `You're about to permanently delete <strong>${escapeHtml(label)}</strong>.`,
        async () => {
          const res = await fetch("/api/admin/items/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
          });
          if (res.ok) await loadBasesView();
          else {
            const data = await res.json().catch(() => ({}));
            siteAlert(data.error || "Failed to delete card.", { variant: "warn", title: "Error" });
          }
        }
      );
    });
  });
}

backToBasesBtn?.addEventListener("click", () => {
  activeBaseName = null;
  showBasesListView();
});

deleteBaseBtn?.addEventListener("click", () => {
  if (!activeBaseName) return;
  const items = allInventoryItems.filter(i => String(i.base || "").trim() === activeBaseName);
  openConfirmDelete(
    `Delete base "${activeBaseName}"?`,
    `This will permanently delete <strong>${items.length} card${items.length === 1 ? "" : "s"}</strong> under this base.`,
    async () => {
      const res = await fetch("/api/admin/bases/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base: activeBaseName })
      });
      if (res.ok) {
        activeBaseName = null;
        showBasesListView();
        await loadBasesView();
      } else {
        const data = await res.json().catch(() => ({}));
        siteAlert(data.error || "Failed to delete base.", { variant: "warn", title: "Error" });
      }
    }
  );
});

baseDetailAppendBtn?.addEventListener("click", async () => {
  const text = baseDetailPasteInput.value.trim();
  if (!text) {
    baseDetailStatus.textContent = "Paste at least one stock line.";
    baseDetailStatus.style.color = "var(--red)";
    return;
  }
  if (!activeBaseName) return;

  // Look up the existing base metadata from a sample item
  const sample = allInventoryItems.find(i => String(i.base || "").trim() === activeBaseName) || {};

  baseDetailAppendBtn.disabled = true;
  baseDetailAppendBtn.innerHTML = `<span class="spinner-sm" style="margin-right:8px;"></span>Looking up BINs...`;
  baseDetailStatus.textContent = "";

  try {
    const res = await fetch("/api/items/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "append",
        text,
        base: activeBaseName,
        price: sample.price || "2.00"
        // type / level / country / issuer come from BIN lookup per-card
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import failed.");
    baseDetailPasteInput.value = "";
    baseDetailStatus.textContent = `Added ${data.imported} card(s).`;
    baseDetailStatus.style.color = "var(--green)";
    await loadBasesView();
  } catch (e) {
    baseDetailStatus.textContent = e.message || "Import failed.";
    baseDetailStatus.style.color = "var(--red)";
  } finally {
    baseDetailAppendBtn.disabled = false;
    baseDetailAppendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Append Cards`;
  }
});

// =========================================================================
// CONFIRM DELETE MODAL (replaces browser confirm())
// =========================================================================
const confirmDeleteModal = document.querySelector("#confirmDeleteModal");
const confirmDeleteTitle = document.querySelector("#confirmDeleteTitle");
const confirmDeleteMessage = document.querySelector("#confirmDeleteMessage");
const closeConfirmDeleteBtn = document.querySelector("#closeConfirmDeleteBtn");
const cancelConfirmDeleteBtn = document.querySelector("#cancelConfirmDeleteBtn");
const acceptConfirmDeleteBtn = document.querySelector("#acceptConfirmDeleteBtn");
let confirmDeleteCallback = null;

function openConfirmDelete(title, messageHtml, callback) {
  confirmDeleteTitle.textContent = title;
  confirmDeleteMessage.innerHTML = messageHtml;
  confirmDeleteCallback = callback;
  confirmDeleteModal.classList.add("active");
}
function closeConfirmDelete() {
  confirmDeleteModal.classList.remove("active");
  confirmDeleteCallback = null;
}
closeConfirmDeleteBtn?.addEventListener("click", closeConfirmDelete);
cancelConfirmDeleteBtn?.addEventListener("click", closeConfirmDelete);
confirmDeleteModal?.addEventListener("click", (e) => {
  if (e.target === confirmDeleteModal) closeConfirmDelete();
});
acceptConfirmDeleteBtn?.addEventListener("click", async () => {
  const cb = confirmDeleteCallback;
  if (!cb) return closeConfirmDelete();
  acceptConfirmDeleteBtn.disabled = true;
  acceptConfirmDeleteBtn.innerHTML = `<span class="spinner-sm" style="margin-right:6px;"></span>Deleting...`;
  try {
    await cb();
  } finally {
    acceptConfirmDeleteBtn.disabled = false;
    acceptConfirmDeleteBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg> Delete`;
    closeConfirmDelete();
  }
});

submitNewBaseBtn?.addEventListener("click", async () => {
  const baseName = document.querySelector("#baseNameInput").value.trim();
  const price = document.querySelector("#basePriceInput").value.trim();
  const text = document.querySelector("#baseStockInput").value.trim();

  newBaseStatus.style.color = "var(--muted)";

  if (!baseName) {
    newBaseStatus.textContent = "Base name is required.";
    newBaseStatus.style.color = "var(--red)";
    return;
  }
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    newBaseStatus.textContent = "Enter a valid price.";
    newBaseStatus.style.color = "var(--red)";
    return;
  }
  if (!text) {
    newBaseStatus.textContent = "Paste at least one stock line.";
    newBaseStatus.style.color = "var(--red)";
    return;
  }

  submitNewBaseBtn.disabled = true;
  submitNewBaseBtn.innerHTML = `<span class="spinner-sm" style="margin-right:8px;"></span>Looking up BINs & importing...`;

  try {
    const res = await fetch("/api/items/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "append",
        text,
        base: baseName,
        price,
        refundable: document.querySelector("#baseRefundableInput").checked,
        refundWindowHours: getSelectedRefundWindow()
        // type / level / country / issuer come from BIN lookup server-side
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import failed.");

    newBaseStatus.textContent = `Added ${data.imported} card(s) under "${baseName}".`;
    newBaseStatus.style.color = "var(--green)";

    // Refresh bases grid in the background
    loadBasesView().catch(() => {});

    setTimeout(closeNewBaseModal, 900);
  } catch (e) {
    newBaseStatus.textContent = e.message || "Import failed.";
    newBaseStatus.style.color = "var(--red)";
  } finally {
    submitNewBaseBtn.disabled = false;
    submitNewBaseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Add Cards to Inventory`;
  }
});

const productModalOverlay = document.querySelector("#productModalOverlay");
const closeProductModal = document.querySelector("#closeProductModal");
const adminProductForm = document.querySelector("#adminProductForm");
const newProductBtn = document.querySelector("#newProductBtn");
const variantsManagementSection = document.querySelector("#variantsManagementSection");
const addVariantBtn = document.querySelector("#addVariantBtn");
const adminProductVariantsList = document.querySelector("#adminProductVariantsList");
const stockModalOverlay = document.querySelector("#stockModalOverlay");
const closeStockModal = document.querySelector("#closeStockModal");
const stockModalTitle = document.querySelector("#stockModalTitle");
const stockPasteInput = document.querySelector("#stockPasteInput");
const stockFileInput = document.querySelector("#stockFileInput");
const stockLogsTableBody = document.querySelector("#stockLogsTableBody");
let activeProductId = null;
let activeVariantId = null;

function renderVariantsList(product) {
  if (!adminProductVariantsList) return;
  const variants = productVariants(product);
  if (variants.length === 0) {
    adminProductVariantsList.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted); font-size:12.5px; font-weight:600;">No variants yet. Click "+ Add Variant" above to create one.</div>';
    return;
  }
  adminProductVariantsList.innerHTML = variants.map(v => {
    const isCustom = product.isCustom || product.isManualDelivery;
    let stockCount = 0;
    let isUnlimited = false;

    if (isCustom) {
      isUnlimited = product.unlimitedStock !== false;
      stockCount = typeof v.manualStock === "number" ? v.manualStock : 0;
    } else {
      stockCount = variantStockCount(v);
    }

    const stockPillHtml = isUnlimited
      ? `<span class="admin-variant-stock-pill in-stock">Unlimited</span>`
      : `<span class="admin-variant-stock-pill ${stockCount > 0 ? 'in-stock' : 'out-of-stock'}">${stockCount} in stock</span>`;

    return `
      <div class="admin-variant-card">
        <div class="admin-variant-info">
          <div class="admin-variant-name">${escapeHtml(formatVariantName(v.name))}</div>
          <div class="admin-variant-meta">
            <span class="admin-variant-price">£${Number(v.price || 0).toFixed(2)}</span>
            <span class="admin-variant-dot">&middot;</span>
            <span class="admin-variant-min">min ${v.min || 1}</span>
            <span class="admin-variant-dot">&middot;</span>
            ${stockPillHtml}
          </div>
        </div>
        <div class="admin-variant-actions">
          <button type="button" class="btn-var-stock" onclick="window.openVariantStock('${product.id}','${v.id}')">Stock</button>
          ${!isCustom ? `
          <button type="button" class="btn-var-icon-btn btn-var-download" onclick="window.downloadVariantStock('${product.id}','${v.id}')" title="Download Stock">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>` : ''}
          <button type="button" class="btn-var-icon-btn btn-var-edit" onclick="window.editVariant('${product.id}','${v.id}')" title="Edit Variant">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" class="btn-var-icon-btn btn-var-delete" onclick="window.deleteVariant('${product.id}','${v.id}', this)" title="Delete Variant">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

const defaultImagePlaceholderSvg = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.35; color: var(--muted);"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`;

newProductBtn?.addEventListener("click", () => {
  document.querySelector("#productModalTitle").textContent = "Add New Product";
  document.querySelector("#editProductId").value = "";
  document.querySelector("#productTitle").value = "";
  document.querySelector("#productImage").value = "";
  document.querySelector("#productDescription").value = "";
  document.querySelector("#productTags").value = "";
  document.querySelector("#productCountry").value = "GLOBAL";
  populateCategorySelect(adminCategories[0] || "");
  document.querySelector("#productImagePreviewContainer").innerHTML = defaultImagePlaceholderSvg;
  document.querySelector("#variantsManagementSection").style.display = "none";
  productModalOverlay.classList.add("active");
});

closeProductModal?.addEventListener("click", () => {
  productModalOverlay.classList.remove("active");
});
document.querySelector("#cancelProductModalBtn")?.addEventListener("click", () => {
  productModalOverlay.classList.remove("active");
});

window.editProductPrompt = function(productId) {
  const product = adminProducts.find(p => p.id === productId);
  if (!product) return;

  activeProductId = product.id;
  document.querySelector("#productModalTitle").textContent = "Manage Product";
  document.querySelector("#editProductId").value = product.id;
  document.querySelector("#productTitle").value = product.title;
  document.querySelector("#productImage").value = product.image || "";
  document.querySelector("#productDescription").value = product.description || "";
  document.querySelector("#productTags").value = product.tags || "";
  document.querySelector("#productCountry").value = product.country || "GLOBAL";

  populateCategorySelect(product.category || adminCategories[0] || "");

  const imgContainer = document.querySelector("#productImagePreviewContainer");
  if (product.image) {
    imgContainer.innerHTML = `<img src="${escapeHtml(product.image)}" style="width:100%;height:100%;object-fit:cover;border-radius:2px;" onerror="this.outerHTML='<svg width=\\'30\\' height=\\'30\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.6\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' style=\\'opacity:0.35; color: var(--muted);\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-5-5L5 21\\'/></svg>'">`;
  } else {
    imgContainer.innerHTML = defaultImagePlaceholderSvg;
  }

  document.querySelector("#variantsManagementSection").style.display = "block";
  renderVariantsList(product);
  productModalOverlay.classList.add("active");
};

document.querySelector("#productImage")?.addEventListener("input", (e) => {
  const url = e.target.value.trim();
  const imgContainer = document.querySelector("#productImagePreviewContainer");
  if (url) {
    imgContainer.innerHTML = `<img src="${escapeHtml(url)}" style="width:100%;height:100%;object-fit:cover;border-radius:2px;" onerror="this.outerHTML='<svg width=\\'30\\' height=\\'30\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.6\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' style=\\'opacity:0.35; color: var(--muted);\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-5-5L5 21\\'/></svg>'">`;
  } else {
    imgContainer.innerHTML = defaultImagePlaceholderSvg;
  }
});

// File upload handler
document.querySelector("#productImageUpload")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const uploadBtn = e.target.parentElement;
  const originalText = uploadBtn.childNodes[0].textContent;
  uploadBtn.childNodes[0].textContent = "Uploading...";

  try {
    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: {
        "Content-Type": file.type
      },
      body: file
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "HTTP upload error");
    }

    const data = await res.json();
    if (data.success && data.url) {
      document.querySelector("#productImage").value = data.url;
      document.querySelector("#productImage").dispatchEvent(new Event("input"));
    } else {
      throw new Error(data.error || "Response failed status");
    }
  } catch (err) {
    alert("Upload failed: " + err.message);
  } finally {
    uploadBtn.childNodes[0].textContent = originalText;
    e.target.value = "";
  }
});

window.toggleHideProduct = async function(productId, btn) {
  if (!btn && window.event && window.event.target) {
    btn = window.event.target.closest("button");
  }
  const originalHtml = btn ? btn.innerHTML : "";
  const originalDisabled = btn ? btn.disabled : false;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-loading-spinner" style="margin-right:0;"></span>`;
  }
  try {
    const res = await fetch("/api/admin/products/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId })
    });
    if (res.ok) {
      await refreshAdminData();
    } else {
      siteAlert("Failed to toggle visibility.", { variant: "warn", title: "Error" });
      if (btn) {
        btn.disabled = originalDisabled;
        btn.innerHTML = originalHtml;
      }
    }
  } catch (e) {
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
    if (btn) {
      btn.disabled = originalDisabled;
      btn.innerHTML = originalHtml;
    }
  }
};

window.deleteProduct = async function(productId, btn) {
  if (!btn && window.event && window.event.target) {
    btn = window.event.target.closest("button");
  }
  if (!(await siteConfirm("Are you sure you want to delete this product?", { title: "Delete product", confirmLabel: "Delete" }))) return;
  const originalHtml = btn ? btn.innerHTML : "";
  const originalDisabled = btn ? btn.disabled : false;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-loading-spinner" style="margin-right:0;"></span>`;
  }
  try {
    const res = await fetch("/api/admin/products/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId })
    });
    if (res.ok) {
      await refreshAdminData();
    } else {
      siteAlert("Failed to delete product.", { variant: "warn", title: "Error" });
      if (btn) {
        btn.disabled = originalDisabled;
        btn.innerHTML = originalHtml;
      }
    }
  } catch (e) {
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
    if (btn) {
      btn.disabled = originalDisabled;
      btn.innerHTML = originalHtml;
    }
  }
};

adminProductForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitBtn = adminProductForm.querySelector('button[type="submit"]');
  const originalHtml = submitBtn ? submitBtn.innerHTML : "Save Product Details";

  const id = document.querySelector("#editProductId").value;
  const title = document.querySelector("#productTitle").value.trim();
  const image = document.querySelector("#productImage").value.trim();
  const description = document.querySelector("#productDescription").value.trim();
  const tags = document.querySelector("#productTags").value.trim();
  const category = document.querySelector("#productCategory").value;
  const country = document.querySelector("#productCountry").value;

  if (!title) { siteAlert("Product title is required.", { variant: "warn", title: "Missing field" }); return; }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.6s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Saving...`;
  }

  const url = id ? "/api/admin/products/edit" : "/api/admin/products";
  const payload = { title, image, description, tags, category, country };
  if (id) payload.id = id;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      if (submitBtn) {
        submitBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved!`;
      }
      siteToast(id ? "Product details updated successfully!" : "New product created successfully!", "success");

      if (!id) {
        setTimeout(() => {
          productModalOverlay.classList.remove("active");
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalHtml; }
        }, 400);
      } else {
        const idx = adminProducts.findIndex(p => p.id === id);
        if (idx >= 0) {
          adminProducts[idx] = { ...adminProducts[idx], ...data.product };
        }
        setTimeout(() => {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalHtml; }
        }, 600);
      }
      refreshAdminData();
    } else {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalHtml; }
      siteAlert(data.error || "Failed to save product.", { variant: "warn", title: "Error" });
    }
  } catch (e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalHtml; }
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
  }
});

addVariantBtn?.addEventListener("click", async () => {
  const editId = document.querySelector("#editProductId").value;
  if (!editId) {
    siteAlert("Save the product first, then add variants.", { variant: "warn", title: "Save required" });
    return;
  }
  activeProductId = editId;
  const result = await sitePrompt({
    title: "Add Variant",
    submitLabel: "Add Variant",
    fields: [
      { name: "name", label: "Variant name", value: "", placeholder: "e.g. 1 Month", required: true },
      { name: "price", label: "Price (USD)", value: "1.00", type: "number", step: "0.01", required: true },
      { name: "min", label: "Minimum quantity", value: "1", type: "number", step: "1", required: true }
    ]
  });
  if (!result) return;
  const { name, price, min } = result;

  try {
    const res = await fetch("/api/admin/products/variants/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: activeProductId, name, price, min })
    });
    const data = await res.json();
    if (!res.ok) return siteAlert(data.error || "Could not add variant.", { variant: "warn", title: "Error" });
    siteToast("Variant added successfully!", "success");
    await refreshAdminData();
    const product = adminProducts.find(p => p.id === activeProductId);
    if (product) renderVariantsList(product);
  } catch (e) {
    siteAlert("Connection error: " + e.message, { variant: "warn", title: "Error" });
  }
});

window.editVariant = async function(productId, variantId) {
  const product = adminProducts.find(p => p.id === productId);
  const variant = productVariants(product).find(v => v.id === variantId);
  if (!variant) return;
  const result = await sitePrompt({
    title: "Edit Variant",
    submitLabel: "Save Changes",
    fields: [
      { name: "name", label: "Variant name", value: variant.name, required: true },
      { name: "price", label: "Price (USD)", value: variant.price, type: "number", step: "0.01", required: true },
      { name: "min", label: "Minimum quantity", value: variant.min || 1, type: "number", step: "1", required: true }
    ]
  });
  if (!result) return;
  const { name, price, min } = result;

  const res = await fetch("/api/admin/products/variants/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, variantId, name, price, min })
  });
  const data = await res.json();
  if (!res.ok) return siteAlert(data.error || "Could not edit variant.", { variant: "warn", title: "Error" });
  siteToast("Variant updated!", "success");
  await refreshAdminData();
  const updated = adminProducts.find(p => p.id === productId);
  if (updated) renderVariantsList(updated);
};

window.deleteVariant = async function(productId, variantId, btn) {
  if (!btn && window.event && window.event.target) {
    btn = window.event.target.closest("button");
  }
  if (!(await siteConfirm("Delete this variant and its stock?", { title: "Delete variant", confirmLabel: "Delete" }))) return;
  const originalHtml = btn ? btn.innerHTML : "";
  const originalDisabled = btn ? btn.disabled : false;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-loading-spinner" style="margin-right:0;"></span>`;
  }
  try {
    const res = await fetch("/api/admin/products/variants/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, variantId })
    });
    const data = await res.json();
    if (!res.ok) {
      if (btn) { btn.disabled = originalDisabled; btn.innerHTML = originalHtml; }
      return siteAlert(data.error || "Could not delete variant.", { variant: "warn", title: "Error" });
    }
    siteToast("Variant deleted.", "success");
    await refreshAdminData();
    const updated = adminProducts.find(p => p.id === productId);
    if (updated) renderVariantsList(updated);
  } catch (e) {
    if (btn) { btn.disabled = originalDisabled; btn.innerHTML = originalHtml; }
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
  }
};

function getActiveVariant() {
  const product = adminProducts.find(p => p.id === activeProductId);
  const variant = productVariants(product).find(v => v.id === activeVariantId);
  return { product, variant };
}

function renderStockRows() {
  const { variant } = getActiveVariant();
  const stock = variant?.stock || [];
  if (stock.length === 0) {
    stockLogsTableBody.innerHTML = '<tr><td colspan="3" style="padding: 24px; text-align: center; color: var(--muted); font-size: 12px; font-weight: 600;">No stock loaded for this variant.</td></tr>';
    return;
  }
  stockLogsTableBody.innerHTML = stock.map(item => `
    <tr>
      <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04); font-family:'JetBrains Mono',monospace; font-size:12px; color:#fdba74;">${escapeHtml(item.content)}</td>
      <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04); font-size:11.5px; color:rgba(255,255,255,0.5);">${escapeHtml(item.added || "")}</td>
      <td style="padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04); text-align:right;">
        <button type="button" class="btn-var-delete" style="height:26px; padding:0 8px; font-size:11px;" onclick="window.deleteStockItem('${item.id}')">Del</button>
      </td>
    </tr>
  `).join("");
}

window.openVariantStock = function(productId, variantId) {
  const product = adminProducts.find(p => p.id === productId);
  const variant = productVariants(product).find(v => v.id === variantId);
  if (!product || !variant) return;
  activeProductId = productId;
  activeVariantId = variantId;
  stockModalTitle.textContent = `Stock: ${variant.name}`;
  stockPasteInput.value = "";
  if (stockFileInput) stockFileInput.value = "";
  renderStockRows();
  stockModalOverlay.classList.add("active");
};

window.openManualStock = async function(productId, variantId) {
  const product = adminProducts.find(p => p.id === productId);
  if (!product) return;
  const variant = productVariants(product).find(v => v.id === variantId);
  if (!variant) return;

  const currentStock = typeof variant.manualStock === "number" ? variant.manualStock : 0;
  const newStockStr = prompt(`Set numeric stock count for variant "${variant.name}":`, currentStock);
  if (newStockStr === null) return;
  
  const newStock = parseInt(newStockStr, 10);
  if (isNaN(newStock) || newStock < 0) {
    siteAlert("Please enter a valid non-negative number.", { variant: "warn", title: "Invalid Input" });
    return;
  }

  const res = await fetch("/api/admin/products/variants/stock/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, variantId, manualStock: newStock })
  });
  const data = await res.json();
  if (!res.ok) {
    siteAlert(data.error || "Failed to update stock.", { variant: "warn", title: "Error" });
  } else {
    await refreshAdminData();
    siteToast("Stock updated successfully!", "success");
    const updated = adminProducts.find(p => p.id === productId);
    if (updated) renderVariantsList(updated);
  }
};

closeStockModal?.addEventListener("click", () => {
  stockModalOverlay.classList.remove("active");
});
document.querySelector("#closeStockModalBottomBtn")?.addEventListener("click", () => {
  stockModalOverlay.classList.remove("active");
});

document.querySelector("#tabUploadFile")?.addEventListener("click", () => {
  document.querySelector("#contentUploadFile").style.display = "block";
  document.querySelector("#contentPasteLogs").style.display = "none";
  document.querySelector("#tabUploadFile").classList.add("active");
  document.querySelector("#tabPasteLogs").classList.remove("active");
});

document.querySelector("#tabPasteLogs")?.addEventListener("click", () => {
  document.querySelector("#contentUploadFile").style.display = "none";
  document.querySelector("#contentPasteLogs").style.display = "block";
  document.querySelector("#tabUploadFile").classList.remove("active");
  document.querySelector("#tabPasteLogs").classList.add("active");
});

document.querySelector("#stockImportBtn")?.addEventListener("click", async () => {
  const btn = document.querySelector("#stockImportBtn");
  const original = btn.innerHTML;
  const logs = stockPasteInput.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!logs.length) {
    siteAlert("Please paste one or more log lines first.", { variant: "warn", title: "Empty input" });
    return;
  }
  if (!activeProductId || !activeVariantId) return;

  btn.disabled = true;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.6s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Importing...`;

  try {
    const res = await fetch("/api/admin/products/variants/stock/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: activeProductId, variantId: activeVariantId, logs })
    });
    const data = await res.json();
    if (!res.ok) {
      siteAlert(data.error || "Could not import stock.", { variant: "warn", title: "Error" });
    } else {
      stockPasteInput.value = "";
      siteToast(`Successfully added ${logs.length} stock items!`, "success");
      await refreshAdminData();
      renderStockRows();
      const product = adminProducts.find(p => p.id === activeProductId);
      if (product) renderVariantsList(product);
    }
  } catch (e) {
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
});

document.querySelector("#stockUploadBtn")?.addEventListener("click", async () => {
  const file = stockFileInput.files?.[0];
  if (!file) return siteAlert("Choose a .txt file first.", { variant: "warn", title: "No file chosen" });
  const text = await file.text();
  stockPasteInput.value = text;
  document.querySelector("#stockImportBtn").click();
  stockFileInput.value = "";
});

window.deleteStockItem = async function(stockId, btn) {
  if (!btn && window.event && window.event.target) {
    btn = window.event.target.closest("button");
  }
  const originalHtml = btn ? btn.innerHTML : "";
  const originalDisabled = btn ? btn.disabled : false;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-loading-spinner" style="margin-right:0;"></span>`;
  }
  try {
    const res = await fetch("/api/admin/products/variants/stock/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: activeProductId, variantId: activeVariantId, stockId })
    });
    const data = await res.json();
    if (!res.ok) {
      if (btn) { btn.disabled = originalDisabled; btn.innerHTML = originalHtml; }
      return siteAlert(data.error || "Could not delete stock item.", { variant: "warn", title: "Error" });
    }
    siteToast("Stock item deleted.", "success");
    await refreshAdminData();
    renderStockRows();
    const product = adminProducts.find(p => p.id === activeProductId);
    if (product) renderVariantsList(product);
  } catch (e) {
    if (btn) { btn.disabled = originalDisabled; btn.innerHTML = originalHtml; }
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
  }
};

document.querySelector("#stockClearAllBtn")?.addEventListener("click", async () => {
  if (!(await siteConfirm("Delete all unsold stock for this variant?", { title: "Clear stock", confirmLabel: "Delete All" }))) return;
  const res = await fetch("/api/admin/products/variants/stock/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: activeProductId, variantId: activeVariantId })
  });
  const data = await res.json();
  if (!res.ok) return siteAlert(data.error || "Could not clear stock.", { variant: "warn", title: "Error" });
  siteToast("All stock cleared.", "success");
  await refreshAdminData();
  renderStockRows();
  const product = adminProducts.find(p => p.id === activeProductId);
  if (product) renderVariantsList(product);
});

// =========================================================================
// ADMIN ADJUST USER BALANCE
// =========================================================================
window.adjustUserBalance = async function(email) {
  const result = await sitePrompt({
    title: "Adjust Balance",
    submitLabel: "Apply",
    fields: [
      { name: "amount", label: `Amount to add to ${email} (use a negative number to subtract)`, value: "10.00", type: "number", step: "0.01", required: true }
    ]
  });
  if (!result) return;
  const amount = parseFloat(result.amount);
  if (isNaN(amount)) {
    siteAlert("Invalid amount.", { variant: "warn", title: "Invalid input" });
    return;
  }
  try {
    const res = await fetch("/api/admin/users/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, amount })
    });
    const data = await res.json();
    if (res.ok) {
      siteAlert(`New balance is £${Number(data.balance).toFixed(2)}`, { variant: "success", title: "Balance updated" });
      refreshAdminData();
    } else if (res.status === 401) {
      await siteAlert("Your session has expired. Please log in again.", { variant: "warn", title: "Session Expired" });
      window.location.href = "/login.html";
    } else {
      siteAlert(data.error || "Failed to adjust balance.", { variant: "warn", title: "Error" });
    }
  } catch (e) {
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
  }
};

// =========================================================================
// ACCTRPLUG ADMINISTRATOR REPLACEMENTS SUPPORT DESK CHAT CONTROLLER
// =========================================================================
let adminReplacementTicketsList = [];
let adminActiveTicketId = null;
let adminActiveTicketPoller = null;

// Expose forceCompleteOrder globally
window.forceCompleteOrder = async function(orderId) {
  if (!(await siteConfirm(`Force-complete transaction order ${orderId}? No real blockchain payment is required.`, { title: "Force-complete order", confirmLabel: "Force-complete", danger: false }))) return;
  try {
    const res = await fetch("/api/admin/payments/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId })
    });
    const data = await res.json();
    if (res.ok) {
      await siteAlert("Order processed successfully.", { variant: "success", title: "Done" });
      refreshAdminData();
    } else {
      siteAlert(data.error || "Override failed.", { variant: "warn", title: "Error" });
    }
  } catch(e) {
    siteAlert("Connection error.", { variant: "warn", title: "Error" });
  }
};

// Replacements Tab Trigger Event
document.querySelector('.admin-tab[data-admin-tab="replacements"]')?.addEventListener("click", () => {
  loadAdminReplacementTickets();
  showAdminChatPlaceholder();
});

async function loadAdminReplacementTickets() {
  const container = document.getElementById("adminTicketsListContainer");
  const countBadge = document.getElementById("adminTicketCountBadge");
  const queueCount = document.getElementById("adminTicketQueueCount");

  try {
    const res = await fetch("/api/admin/replacements/all");
    const data = await res.json();
    adminReplacementTicketsList = data.tickets || [];

    if (countBadge) countBadge.innerText = adminReplacementTicketsList.length;
    if (queueCount) queueCount.innerText = adminReplacementTicketsList.length;

    if (adminReplacementTicketsList.length === 0) {
      container.innerHTML = `<div style="font-size:12.5px; color:#64748b; text-align:center; padding:32px 0;">No active support tickets.</div>`;
      return;
    }

    renderFilteredAdminTickets(adminReplacementTicketsList);
  } catch(e) {
    console.error("loadAdminReplacementTickets error:", e);
  }
}

function renderFilteredAdminTickets(tickets) {
  const container = document.getElementById("adminTicketsListContainer");
  if (!container) return;

  if (tickets.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:#64748b; text-align:center; padding:24px 0;">No matching tickets.</div>`;
    return;
  }

  container.innerHTML = tickets.map(t => {
    const st = (t.status || 'PENDING').toLowerCase();
    return `
      <div class="ticket-item ${adminActiveTicketId === t.id ? 'active' : ''}" onclick="window.openAdminTicketMessages('${t.id}')">
        <div class="ticket-item-top">
          <span class="ticket-item-id">${escapeHtml(t.id)}</span>
          <span class="ticket-status-pill ${st}">${escapeHtml(t.status || 'PENDING')}</span>
        </div>
        <div class="ticket-item-product">${escapeHtml(t.productName || t.description || 'Support Request')}</div>
        <div class="ticket-item-bottom">
          <span>${escapeHtml(t.userEmail || t.userId || 'User')}</span>
          <span>${new Date(t.createdAt || Date.now()).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  }).join("");
}

// Search ticket input listener
function initTicketSearchInput() {
  const searchInput = document.getElementById("adminTicketSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = (e.target.value || "").toLowerCase().trim();
      if (!q) {
        renderFilteredAdminTickets(adminReplacementTicketsList);
        return;
      }
      const filtered = adminReplacementTicketsList.filter(t => 
        (t.id && t.id.toLowerCase().includes(q)) ||
        (t.userEmail && t.userEmail.toLowerCase().includes(q)) ||
        (t.orderId && t.orderId.toLowerCase().includes(q)) ||
        (t.productName && t.productName.toLowerCase().includes(q)) ||
        (t.issueReason && t.issueReason.toLowerCase().includes(q))
      );
      renderFilteredAdminTickets(filtered);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTicketSearchInput);
} else {
  initTicketSearchInput();
}

function showAdminChatPlaceholder() {
  const placeholder = document.getElementById("adminChatPlaceholder");
  const activeView = document.getElementById("adminChatActiveView");
  if (placeholder) placeholder.style.display = "flex";
  if (activeView) activeView.style.display = "none";
  if (adminActiveTicketPoller) clearInterval(adminActiveTicketPoller);
  adminActiveTicketId = null;
}

window.openAdminTicketMessages = async function(ticketId) {
  adminActiveTicketId = ticketId;
  renderFilteredAdminTickets(adminReplacementTicketsList);

  const placeholder = document.getElementById("adminChatPlaceholder");
  const activeView = document.getElementById("adminChatActiveView");
  const layout = document.querySelector(".admin-replacements-layout");
  if (placeholder) placeholder.style.display = "none";
  if (activeView) activeView.style.display = "flex";
  if (layout) layout.classList.add("chat-view-active");

  const ticket = adminReplacementTicketsList.find(t => t.id === ticketId);
  const titleEl = document.getElementById("adminActiveTicketTitle");
  const statusBadge = document.getElementById("adminActiveTicketStatusBadge");
  const userEl = document.getElementById("adminActiveTicketUser");
  const textarea = document.getElementById("adminChatTextarea");

  if (titleEl) titleEl.innerText = ticketId;
  if (statusBadge && ticket) {
    const st = (ticket.status || 'PENDING').toLowerCase();
    statusBadge.className = `ticket-status-pill ${st}`;
    statusBadge.innerText = (ticket.status || 'PENDING').toUpperCase();
  }
  if (userEl && ticket) {
    userEl.innerText = `Customer: ${ticket.userEmail || ticket.userId} | Order ID: ${ticket.orderId || '—'}`;
  }
  if (textarea) textarea.value = "";

  await refreshAdminTicketMessagesFlow(ticketId);

  const box = document.getElementById("adminChatMessagesBox");
  if (box) box.scrollTop = box.scrollHeight;

  // Poll chat updates
  if (adminActiveTicketPoller) clearInterval(adminActiveTicketPoller);
  adminActiveTicketPoller = setInterval(() => {
    if (adminActiveTicketId === ticketId) {
      refreshAdminTicketMessagesFlow(ticketId);
    }
  }, 6000);
};

async function refreshAdminTicketMessagesFlow(ticketId) {
  const ticket = adminReplacementTicketsList.find(t => t.id === ticketId);
  if (!ticket) return;

  try {
    let messages = ticket.messages || [];
    try {
      const res = await fetch(`/api/replacements/${ticketId}/messages`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.messages)) messages = data.messages;
      }
    } catch(err) {}

    // Load ticket metadata details card
    const metaCard = document.getElementById("adminActiveTicketMetaCard");
    if (metaCard) {
      metaCard.innerHTML = `
        <div class="ticket-meta-item">
          <span class="ticket-meta-lbl">ORDER ID</span>
          <span class="ticket-meta-val" style="color:#fb923c;">${escapeHtml(ticket.orderId || '—')}</span>
        </div>
        <div class="ticket-meta-item">
          <span class="ticket-meta-lbl">PRODUCT</span>
          <span class="ticket-meta-val">${escapeHtml(ticket.productName || '—')}</span>
        </div>
        <div class="ticket-meta-item">
          <span class="ticket-meta-lbl">OPTION & QTY</span>
          <span class="ticket-meta-val">${escapeHtml(ticket.variantName || 'Standard')} (${ticket.replacementCount || 1}x)</span>
        </div>
        <div class="ticket-meta-item">
          <span class="ticket-meta-lbl">ISSUE REASON</span>
          <span class="ticket-meta-val" style="color:#f59e0b;">${escapeHtml(ticket.issueReason || ticket.description || '—')}</span>
        </div>
      `;
    }

    // Render Chat Messages Bubbles
    const container = document.getElementById("adminChatMessagesBox");
    if (container) {
      if (!messages || messages.length === 0) {
        container.innerHTML = `<div style="font-size:12.5px; color:#64748b; text-align:center; padding:32px 0;">No messages in this ticket thread yet.</div>`;
      } else {
        container.innerHTML = messages.map(msg => {
          const isAdmin = msg.senderRole === "REPLACE_ADMIN" || msg.senderRole === "ADMIN";
          return `
            <div class="chat-bubble-msg ${isAdmin ? 'admin' : 'user'}">
              <span class="chat-bubble-sender">${isAdmin ? 'Support Staff (You)' : 'Customer (' + escapeHtml(ticket.userEmail) + ')'}</span>
              <div class="chat-bubble-text">${escapeHtml(msg.message || msg.text || '')}</div>
              <span class="chat-bubble-time">${new Date(msg.createdAt || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          `;
        }).join("");
        container.scrollTop = container.scrollHeight;
      }
    }

  } catch(e) {
    console.error("refreshAdminTicketMessagesFlow error:", e);
  }
}

async function loadFreshReplacementsMatches(ticketId) {
  const container = document.getElementById("adminActiveTicketReplacements");
  container.innerHTML = '<span style="font-size:10px; color:var(--muted);">Analyzing fresh stock suggestions...</span>';

  try {
    const res = await fetch(`/api/admin/replacements/${ticketId}/next-stock`);
    const data = await res.json();

    if (!data.nextStockList || data.nextStockList.length === 0) {
      container.innerHTML = '<span style="font-size:10px; color:var(--red); font-weight:700;">OUT OF STOCK. No identical Type/State match available in inventory.</span>';
      return;
    }

    container.innerHTML = data.nextStockList.map(item => `
      <div class="mini-row" style="background:#020403; border:1px solid var(--line); border-radius:6px; padding:10px; font-size:10.5px;">
        <span style="font-weight:700; color:var(--green); text-transform:uppercase; font-size:9px;">Match Found</span>
        <div class="replaced-content-box new" style="margin-top:4px;">${escapeHtml(item.nextStockContent)}</div>
        <button type="button" class="admin-btn primary" style="width:100%; margin-top:8px;" onclick="window.dispatchReplacement('${item.defectiveStockLogId}', '${item.nextStockLogId}', '${escapeHtml(item.nextStockContent)}')">Dispatch Replace</button>
      </div>
    `).join("");
  } catch(e) {
    container.innerHTML = '<span style="font-size:10px; color:var(--red);">Error checking replacement logs.</span>';
  }
}

window.dispatchReplacement = async function(defectiveId, nextId, content) {
  if (!(await siteConfirm("Dispatch this fresh replacement item credentials log directly to customer chat?", { title: "Dispatch replacement", confirmLabel: "Dispatch", danger: false }))) return;

  const payload = {
    message: "Here is your fresh replacement account credentials log:",
    replacementLogs: [{
      stockLogId: defectiveId,
      newStockLogId: nextId,
      content: content
    }]
  };

  try {
    const res = await fetch(`/api/admin/replacements/${adminActiveTicketId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      siteAlert("Replacement dispatched successfully.", { variant: "success", title: "Sent" });
      refreshAdminTicketMessagesFlow(adminActiveTicketId);
    } else {
      siteAlert("Failed to send replacement.", { variant: "warn", title: "Error" });
    }
  } catch(e) {
    console.error(e);
  }
};

async function sendAdminReply() {
  const textEl = document.getElementById("adminChatTextarea");
  const message = textEl.value.trim();
  if (!message || !adminActiveTicketId) return;

  try {
    const res = await fetch(`/api/admin/replacements/${adminActiveTicketId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (res.ok) {
      textEl.value = "";
      refreshAdminTicketMessagesFlow(adminActiveTicketId).then(() => {
        const box = document.getElementById("adminChatMessagesBox");
        box.scrollTop = box.scrollHeight;
      });
    } else {
      const data = await res.json().catch(() => ({}));
      siteAlert(data.error || "Reply failed.", { variant: "warn", title: "Error" });
    }
  } catch(e) {
    console.error(e);
  }
}

async function updateTicketStatus(status) {
  if (!adminActiveTicketId) return;
  try {
    const res = await fetch(`/api/admin/replacements/${adminActiveTicketId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      siteAlert(`Ticket status updated to ${status}.`, { variant: "success", title: "Updated" });
      loadAdminReplacementTickets();
      window.openAdminTicketMessages(adminActiveTicketId);
    }
  } catch(e) {
    console.error(e);
  }
}

async function performAdminTicketAction(action, refundAmount = null, replacementText = null) {
  if (!adminActiveTicketId) return;

  try {
    const res = await fetch("/api/admin/tickets/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: adminActiveTicketId,
        action,
        refundAmount,
        replacementText
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (typeof siteAlert === "function") {
        siteAlert(`Action ${action} executed successfully.`, { variant: "success", title: "Action Complete" });
      } else {
        alert(`Action ${action} executed successfully.`);
      }
      loadAdminReplacementTickets();
      if (typeof window.openAdminTicketMessages === "function") {
        window.openAdminTicketMessages(adminActiveTicketId);
      }
    } else {
      if (typeof siteAlert === "function") {
        siteAlert(data.error || "Action failed.", { variant: "warn", title: "Error" });
      } else {
        alert(data.error || "Action failed.");
      }
    }
  } catch (err) {
    console.error("performAdminTicketAction error:", err);
  }
}

document.getElementById("adminSendChatMessageBtn")?.addEventListener("click", sendAdminReply);
document.getElementById("adminSetStatusPending")?.addEventListener("click", () => updateTicketStatus("PENDING"));
document.getElementById("adminSetStatusResolved")?.addEventListener("click", () => updateTicketStatus("RESOLVED"));
document.getElementById("adminSetStatusDismissed")?.addEventListener("click", () => updateTicketStatus("DISMISSED"));

document.getElementById("adminTicketRefundFullBtn")?.addEventListener("click", async () => {
  const confirmed = await siteConfirm("Refund 100% of order value back to user's balance?", { title: "Full Refund", confirmLabel: "Refund Fully" });
  if (confirmed) performAdminTicketAction("REFUND_FULL");
});

document.getElementById("adminTicketRefundPartialBtn")?.addEventListener("click", async () => {
  const amountStr = prompt("Enter partial refund amount (£):", "5.00");
  if (amountStr) {
    const amt = parseFloat(amountStr);
    if (!isNaN(amt) && amt > 0) {
      performAdminTicketAction("REFUND_PARTIAL", amt);
    }
  }
});

document.getElementById("adminTicketReplaceBtn")?.addEventListener("click", () => {
  const modal = document.querySelector("#adminReplaceModal");
  if (modal) {
    document.querySelector("#adminReplaceTextarea").value = "";
    modal.classList.add("active");
  }
});

document.getElementById("closeAdminReplaceModal")?.addEventListener("click", () => {
  document.querySelector("#adminReplaceModal")?.classList.remove("active");
});
document.getElementById("cancelAdminReplaceBtn")?.addEventListener("click", () => {
  document.querySelector("#adminReplaceModal")?.classList.remove("active");
});

document.getElementById("adminReplaceForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = document.querySelector("#adminReplaceTextarea").value.trim();
  if (text) {
    document.querySelector("#adminReplaceModal")?.classList.remove("active");
    performAdminTicketAction("REPLACE", null, text);
  }
});

document.getElementById("adminTicketDenyBtn")?.addEventListener("click", async () => {
  const confirmed = await siteConfirm("Deny this support ticket request?", { title: "Deny Ticket", confirmLabel: "Deny" });
  if (confirmed) performAdminTicketAction("DENY");
});

// =========================================================================
// PAYMENT GATEWAY SETTINGS MANAGEMENT
// =========================================================================
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    const settings = await res.json();
    const methods = settings.paymentMethods || {};
    
    document.getElementById("toggle-balance").checked = methods.balance !== false;
    document.getElementById("toggle-crypto").checked = methods.crypto !== false;
    document.getElementById("toggle-chime").checked = methods.chime !== false;
    document.getElementById("toggle-tg_stars").checked = methods.tg_stars !== false;
    
    const tgForwarder = settings.telegramForwarder || {};
    document.getElementById("toggle-tg_forwarder_enabled").checked = tgForwarder.enabled === true;
    document.getElementById("tg_forwarder_source_link").value = tgForwarder.sourceMessageLink || "https://t.me/Flowmark/1287";
    document.getElementById("tg_forwarder_interval").value = tgForwarder.intervalHours || 6;

    const toggleParticles = document.getElementById("toggle-particles");
    if (toggleParticles) {
      toggleParticles.checked = settings.particlesEnabled !== false;
    }
    
    if (IS_GOD_MODE) {
      ["balance", "crypto", "chime", "tg_stars", "particles", "tg_forwarder_enabled"].forEach(m => {
        const cb = document.getElementById(`toggle-${m}`);
        if (cb) {
          cb.disabled = true;
          cb.closest(".toggle-switch").style.opacity = "0.5";
          cb.closest(".toggle-switch").style.pointerEvents = "none";
        }
      });
      document.getElementById("tg_forwarder_source_link").disabled = true;
      document.getElementById("tg_forwarder_interval").disabled = true;
      document.getElementById("saveTgForwarderBtn").disabled = true;
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

async function saveSettings() {
  if (IS_GOD_MODE) return;
  
  const toggleParticles = document.getElementById("toggle-particles");
  const payload = {
    paymentMethods: {
      balance: document.getElementById("toggle-balance").checked,
      crypto: document.getElementById("toggle-crypto").checked,
      chime: document.getElementById("toggle-chime").checked,
      tg_stars: document.getElementById("toggle-tg_stars").checked
    },
    particlesEnabled: toggleParticles ? toggleParticles.checked : true,
    telegramForwarder: {
      enabled: document.getElementById("toggle-tg_forwarder_enabled").checked,
      sourceMessageLink: document.getElementById("tg_forwarder_source_link").value.trim(),
      intervalHours: Number(document.getElementById("tg_forwarder_interval").value) || 6
    }
  };
  
  try {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json();
      siteAlert(data.error || "Failed to save settings.", { variant: "warn", title: "Error" });
      loadSettings();
    } else {
      localStorage.setItem("falcon_particles_enabled", String(payload.particlesEnabled));
      if (typeof window.setGlobalParticlesActive === "function") {
        window.setGlobalParticlesActive(payload.particlesEnabled);
      }
    }
  } catch (err) {
    console.error("Failed to save settings:", err);
    loadSettings();
  }
}

document.querySelectorAll('.admin-tab[data-admin-tab="settings"]').forEach(tab => {
  tab?.addEventListener("click", () => loadSettings());
});

["balance", "crypto", "chime", "tg_stars", "particles", "tg_forwarder_enabled"].forEach(m => {
  document.getElementById(`toggle-${m}`)?.addEventListener("change", async () => {
    await saveSettings();
  });
});

document.getElementById("saveTgForwarderBtn")?.addEventListener("click", async () => {
  await saveSettings();
  siteAlert("Telegram Auto-Forwarder settings saved!", { variant: "success", title: "Success" });
});

// =========================================================================
// CATEGORIES TAB
// =========================================================================
async function loadCategoriesTab() {
  await loadCategories();
  renderCategoriesTab();
}

function renderCategoriesTab() {
  const list = document.querySelector("#categoriesListTab");
  if (!list) return;
  if (adminCategories.length === 0) {
    list.innerHTML = `<p style="font-size:13px; color:var(--muted); margin:0;">No categories yet. Add one above.</p>`;
    return;
  }
  list.innerHTML = adminCategories.map(cat => {
    const name = cat.name || cat;
    const icon = cat.icon || "folder";
    return `
      <div style="display:inline-flex; align-items:center; gap:8px; background:var(--bg-deep); border:1px solid var(--line); border-radius:6px; padding:6px 12px; font-size:13px;">
        <span class="material-icons" style="font-size:16px; color:var(--muted);">${escapeHtml(icon)}</span>
        <span>${escapeHtml(name)}</span>
        ${IS_GOD_MODE ? "" : `<button type="button" onclick="window.deleteCategoryTab('${escapeHtml(name)}')" style="background:none; border:none; color:var(--red); cursor:pointer; padding:0; line-height:1; font-size:16px;" title="Remove">&times;</button>`}
      </div>
    `;
  }).join("");
}

window.deleteCategoryTab = async function(name) {
  if (!(await siteConfirm(`Remove category "${name}"? Products keep their data but lose this tab.`, { title: "Remove category", confirmLabel: "Remove" }))) return;
  const res = await fetch("/api/admin/categories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (!res.ok) return siteAlert(data.error || "Failed to delete category.", { variant: "warn", title: "Error" });
  adminCategories = data.categories || [];
  renderCategoriesTab();
  populateCategorySelect();
};

document.querySelector("#addCategoryBtnTab")?.addEventListener("click", async () => {
  const input = document.querySelector("#newCategoryInputTab");
  const status = document.querySelector("#categoryAddStatusTab");
  const iconSelect = document.querySelector("#newCategoryIconTab");
  const name = input.value.trim();
  const icon = iconSelect ? iconSelect.value : "restaurant";
  if (!name) return;
  const res = await fetch("/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, icon })
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || "Failed.";
    status.style.color = "var(--red)";
    return;
  }
  adminCategories = data.categories || [];
  renderCategoriesTab();
  populateCategorySelect();
  input.value = "";
  status.textContent = `"${name}" added.`;
  status.style.color = "var(--green)";
  setTimeout(() => { status.textContent = ""; }, 2000);
});

// =========================================================================
// UNIFIED TRANSACTIONS TAB
// =========================================================================
let adminTransactionsAll = [];

async function loadTransactionsTab() {
  const tbody = document.querySelector("#adminTxnRows");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="empty">Loading transactions...</td></tr>`;
  try {
    const [ordersRes, topupsRes] = await Promise.all([
      fetch("/api/admin/orders"),
      fetch("/api/admin/topups")
    ]);
    const ordersData = await ordersRes.json();
    const topupsData = await topupsRes.json();

    const orders = (ordersData.orders || []).map(o => ({
      id: o.id,
      user: o.userEmail || o.userId || "anon",
      type: "ORDER",
      amount: Number(o.total || 0),
      method: o.paymentMethod || "BALANCE",
      status: o.status,
      date: o.createdAt
    }));

    const topups = (topupsData.topups || []).map(t => ({
      id: t.id,
      user: t.userEmail || t.userId || "anon",
      type: "TOPUP",
      amount: Number(t.amount || 0),
      method: t.paymentMethod || "CRYPTO",
      status: t.status,
      date: t.createdAt
    }));

    adminTransactionsAll = [...orders, ...topups].sort((a, b) => new Date(b.date) - new Date(a.date));
    renderTransactionsTab();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty" style="color:var(--red);">Failed to load transactions.</td></tr>`;
    console.error(e);
  }
}

function renderTransactionsTab() {
  const tbody = document.querySelector("#adminTxnRows");
  if (!tbody) return;

  const query = document.querySelector("#adminTxnSearch").value.trim().toLowerCase();
  const typeFilter = document.querySelector("#adminTxnTypeFilter").value;
  const statusFilter = document.querySelector("#adminTxnStatusFilter").value;

  const filtered = adminTransactionsAll.filter(t => {
    if (typeFilter !== "ALL" && t.type !== typeFilter) return false;
    
    if (statusFilter !== "ALL") {
      if (statusFilter === "COMPLETED" && t.status !== "COMPLETED") return false;
      if (statusFilter === "PENDING" && t.status !== "WAITING_PAYMENT" && t.status !== "CONFIRMING" && t.status !== "PENDING") return false;
      if (statusFilter === "FAILED" && t.status !== "FAILED" && t.status !== "EXPIRED") return false;
    }

    if (query) {
      const hay = [t.id, t.user, t.method, t.type, t.status].join(" ").toLowerCase();
      if (!hay.includes(query)) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No transactions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    let typeBadge = `<span class="status-pill status-completed">${t.type}</span>`;
    if (t.type === "TOPUP") {
      typeBadge = `<span class="status-pill status-topup" style="background:rgba(34,197,94,0.12); color:#22c55e;">TOPUP</span>`;
    }
    
    let statusBadgeColor = statusColor(t.status);
    let statusText = statusLabel(t.status);
    
    return `
      <tr>
        <td class="mono">${escapeHtml(t.id)}</td>
        <td>${escapeHtml(t.user)}</td>
        <td>${typeBadge}</td>
        <td class="amount" style="font-weight:700; color:${t.type === 'TOPUP' ? 'var(--green)' : 'var(--text)'};">${t.type === 'TOPUP' ? '+' : '-'}£${t.amount.toFixed(2)}</td>
        <td><span class="method-pill method-pill-${t.method.toLowerCase()}">${escapeHtml(t.method)}</span></td>
        <td><span class="status-pill" style="background:rgba(255,255,255,0.03); color:${statusBadgeColor};">${escapeHtml(statusText)}</span></td>
        <td>${new Date(t.date).toLocaleDateString()} ${new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      </tr>
    `;
  }).join("");
}

document.querySelector("#adminTxnSearch")?.addEventListener("input", renderTransactionsTab);
document.querySelector("#adminTxnTypeFilter")?.addEventListener("change", renderTransactionsTab);
document.querySelector("#adminTxnStatusFilter")?.addEventListener("change", renderTransactionsTab);

// =========================================================================
// COUPONS TAB
// =========================================================================
async function loadCouponsTab() {
  const tbody = document.querySelector("#adminCouponsRows") || document.querySelector("#adminCouponRows");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="empty">Loading coupons...</td></tr>`;
  try {
    const res = await fetch("/api/admin/coupons");
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty" style="color:var(--red);">Failed to load coupons (${res.status}).</td></tr>`;
      return;
    }
    const data = await res.json();
    const coupons = Array.isArray(data.coupons) ? data.coupons : [];
    
    if (coupons.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">No coupons created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = coupons.map(c => {
      const disc = c.discountType === "PERCENT" ? `${c.discountValue}%` : `£${Number(c.discountValue || 0).toFixed(2)}`;
      const uses = `${c.usedCount || 0} / ${c.maxUses !== null && c.maxUses !== undefined ? c.maxUses : '∞'}`;
      const expires = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never';
      const statusPill = c.isActive 
        ? `<span class="status-pill status-completed">Active</span>`
        : `<span class="status-pill status-failed" style="background:rgba(239,68,68,0.08); color:var(--red);">Inactive</span>`;
        
      return `
        <tr>
          <td class="mono" style="font-weight:700; color:var(--pink);">${escapeHtml(c.code)}</td>
          <td>${disc}</td>
          <td>${uses}</td>
          <td>${expires}</td>
          <td>${statusPill}</td>
          <td style="text-align:right;">
            <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:10px;">
              <button type="button" class="admin-btn" onclick="window.viewCouponAnalytics('${c.id}')">Analytics</button>
              ${IS_GOD_MODE ? "" : `
                <button type="button" class="admin-btn" onclick="window.toggleCoupon('${c.id}')">Toggle</button>
                <button type="button" class="admin-btn danger-btn" onclick="window.deleteCoupon('${c.id}')">Delete</button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty" style="color:var(--red);">Failed to load coupons.</td></tr>`;
    console.error("loadCouponsTab error:", e);
  }
}

window.viewCouponAnalytics = async function(couponId) {
  const modal = document.querySelector("#couponAnalyticsModalOverlay");
  const title = document.querySelector("#couponAnalyticsModalTitle");
  const statRedemptions = document.querySelector("#couponStatRedemptions");
  const statUniqueUsers = document.querySelector("#couponStatUniqueUsers");
  const statMoneySaved = document.querySelector("#couponStatMoneySaved");
  const statSalesRevenue = document.querySelector("#couponStatSalesRevenue");
  const rows = document.querySelector("#couponAnalyticsRows");
  const countLabel = document.querySelector("#couponHistoryCount");

  if (!modal) return;

  if (title) title.textContent = "Loading Analytics...";
  if (rows) rows.innerHTML = `<tr><td colspan="5" class="empty">Loading analytics...</td></tr>`;
  if (statRedemptions) statRedemptions.textContent = "0";
  if (statUniqueUsers) statUniqueUsers.textContent = "0";
  if (statMoneySaved) statMoneySaved.textContent = "£0.00";
  if (statSalesRevenue) statSalesRevenue.textContent = "£0.00";

  modal.classList.add("active");

  try {
    const res = await fetch(`/api/admin/coupons/analytics?couponId=${encodeURIComponent(couponId)}`);
    if (!res.ok) {
      if (rows) rows.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--red);">Failed to load analytics (${res.status}).</td></tr>`;
      return;
    }
    const data = await res.json();
    const c = data.coupon || {};
    const stats = data.stats || {};
    const history = data.history || [];

    if (title) title.textContent = `Coupon Analytics: ${c.code || ""}`;
    if (statRedemptions) statRedemptions.textContent = stats.totalRedemptions || 0;
    if (statUniqueUsers) statUniqueUsers.textContent = stats.uniqueUsersCount || 0;
    if (statMoneySaved) statMoneySaved.textContent = `£${Number(stats.totalMoneySaved || 0).toFixed(2)}`;
    if (statSalesRevenue) statSalesRevenue.textContent = `£${Number(stats.totalSalesRevenue || 0).toFixed(2)}`;
    if (countLabel) countLabel.textContent = `${history.length} order${history.length === 1 ? '' : 's'}`;

    if (history.length === 0) {
      if (rows) rows.innerHTML = `<tr><td colspan="5" class="empty">No redemptions recorded yet.</td></tr>`;
      return;
    }

    if (rows) {
      rows.innerHTML = history.map(h => `
        <tr>
          <td class="mono" style="font-weight:600;">${escapeHtml(h.id)}</td>
          <td style="color:rgba(255,255,255,0.8);">${escapeHtml(h.email)}</td>
          <td style="font-size:11.5px; opacity:0.7;">${new Date(h.date || Date.now()).toLocaleDateString()}</td>
          <td style="color:#4ade80; font-weight:600;">-£${Number(h.discountAmount || 0).toFixed(2)}</td>
          <td style="text-align:right; font-weight:600;">£${Number(h.total || 0).toFixed(2)}</td>
        </tr>
      `).join("");
    }
  } catch (err) {
    console.error("viewCouponAnalytics error:", err);
    if (rows) rows.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--red);">Error loading analytics data.</td></tr>`;
  }
};

document.querySelector("#closeCouponAnalyticsModal")?.addEventListener("click", () => {
  document.querySelector("#couponAnalyticsModalOverlay")?.classList.remove("active");
});

window.toggleCoupon = async function(couponId) {
  try {
    const res = await fetch("/api/admin/coupons/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponId })
    });
    if (res.ok) {
      loadCouponsTab();
    } else {
      const data = await res.json().catch(() => ({}));
      if (typeof siteAlert === "function") {
        siteAlert(data.error || "Failed to toggle coupon.", { variant: "warn", title: "Error" });
      } else {
        alert(data.error || "Failed to toggle coupon.");
      }
    }
  } catch (err) {
    console.error("toggleCoupon error:", err);
  }
};

window.deleteCoupon = async function(couponId) {
  const confirmFn = typeof siteConfirm === "function" ? siteConfirm : (msg => Promise.resolve(confirm(msg)));
  const confirmed = await confirmFn("Delete this coupon code permanently?", { title: "Delete coupon", confirmLabel: "Delete" });
  if (!confirmed) return;

  try {
    const res = await fetch("/api/admin/coupons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponId })
    });
    if (res.ok) {
      loadCouponsTab();
    } else {
      const data = await res.json().catch(() => ({}));
      if (typeof siteAlert === "function") {
        siteAlert(data.error || "Failed to delete coupon.", { variant: "warn", title: "Error" });
      } else {
        alert(data.error || "Failed to delete coupon.");
      }
    }
  } catch (err) {
    console.error("deleteCoupon error:", err);
  }
};

document.getElementById("openNewCouponModalBtn")?.addEventListener("click", () => {
  document.getElementById("couponFormStatus").textContent = "";
  document.getElementById("createCouponForm").reset();
  document.getElementById("couponFormModalOverlay").classList.add("active");
});
document.getElementById("closeCouponFormModal")?.addEventListener("click", () => {
  document.getElementById("couponFormModalOverlay").classList.remove("active");
});
document.getElementById("cancelCouponFormBtn")?.addEventListener("click", () => {
  document.getElementById("couponFormModalOverlay").classList.remove("active");
});
document.getElementById("createCouponForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("couponCodeInputForm").value.trim().toUpperCase();
  const discountType = document.getElementById("couponDiscountType").value;
  const discountValue = parseFloat(document.getElementById("couponDiscountValue").value);
  const maxUses = document.getElementById("couponMaxUses").value ? parseInt(document.getElementById("couponMaxUses").value) : null;
  const expiresAt = document.getElementById("couponExpiresAt").value || null;
  const status = document.getElementById("couponFormStatus");

  try {
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, discountType, discountValue, maxUses, expiresAt })
    });
    const data = await res.json();
    if (!res.ok) {
      status.textContent = data.error || "Failed to create coupon.";
      return;
    }
    document.getElementById("couponFormModalOverlay").classList.remove("active");
    loadCouponsTab();
  } catch (err) {
    status.textContent = "Network error.";
  }
});

// =========================================================================
// ANNOUNCEMENTS TAB
// =========================================================================
async function loadAnnouncementsTab() {
  const tbody = document.querySelector("#adminAnnRows");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="empty">Loading announcements...</td></tr>`;
  try {
    const res = await fetch("/api/admin/announcements");
    const data = await res.json();
    const announcements = data.announcements || [];
    
    if (announcements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">No announcements published yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = announcements.map(a => {
      const statusPill = a.isActive 
        ? `<span class="status-pill status-completed">Active</span>`
        : `<span class="status-pill status-failed" style="background:rgba(239,68,68,0.08); color:var(--red);">Inactive</span>`;
      return `
        <tr>
          <td style="font-weight:700;">${escapeHtml(a.title)}</td>
          <td>${escapeHtml(a.content)}</td>
          <td><span class="status-pill status-${a.type === 'danger' ? 'failed' : (a.type === 'warning' ? 'topup' : 'completed')}">${escapeHtml(a.type.toUpperCase())}</span></td>
          <td>${statusPill}</td>
          <td>${new Date(a.createdAt).toLocaleDateString()}</td>
          <td style="text-align:right;">
            ${IS_GOD_MODE ? "" : `
              <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:10px;">
                <button type="button" class="admin-btn" onclick="window.toggleAnnouncement('${a.id}')">Toggle</button>
                <button type="button" class="admin-btn danger-btn" onclick="window.deleteAnnouncement('${a.id}')">Delete</button>
              </div>
            `}
          </td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty" style="color:var(--red);">Failed to load announcements.</td></tr>`;
    console.error(e);
  }
}

window.toggleAnnouncement = async function(id) {
  try {
    const res = await fetch("/api/admin/announcements/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) loadAnnouncementsTab();
  } catch (err) {
    console.error(err);
  }
};

window.deleteAnnouncement = async function(id) {
  if (!(await siteConfirm("Delete this announcement?", { title: "Delete announcement", confirmLabel: "Delete" }))) return;
  try {
    const res = await fetch("/api/admin/announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) loadAnnouncementsTab();
  } catch (err) {
    console.error(err);
  }
};

document.getElementById("openNewAnnModalBtn")?.addEventListener("click", () => {
  document.getElementById("annFormStatus").textContent = "";
  document.getElementById("createAnnForm").reset();
  document.getElementById("annFormModalOverlay").classList.add("active");
});
document.getElementById("closeAnnFormModal")?.addEventListener("click", () => {
  document.getElementById("annFormModalOverlay").classList.remove("active");
});
document.getElementById("cancelAnnFormBtn")?.addEventListener("click", () => {
  document.getElementById("annFormModalOverlay").classList.remove("active");
});
document.getElementById("createAnnForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("annTitleInput").value.trim();
  const content = document.getElementById("annContentInput").value.trim();
  const type = document.getElementById("annType").value;
  const status = document.getElementById("annFormStatus");

  try {
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, type })
    });
    const data = await res.json();
    if (!res.ok) {
      status.textContent = data.error || "Failed to publish announcement.";
      return;
    }
    document.getElementById("annFormModalOverlay").classList.remove("active");
    loadAnnouncementsTab();
  } catch (err) {
    status.textContent = "Network error.";
  }
});

// =========================================================================
// FAQ TAB
// =========================================================================
async function loadFaqTab() {
  const tbody = document.querySelector("#adminFaqRows");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="empty">Loading FAQ entries...</td></tr>`;
  try {
    const res = await fetch("/api/admin/faq");
    const data = await res.json();
    const faqs = data.faqs || [];
    
    if (faqs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">No FAQ entries published yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = faqs.map(f => {
      const statusPill = f.isActive 
        ? `<span class="status-pill status-completed">Active</span>`
        : `<span class="status-pill status-failed" style="background:rgba(239,68,68,0.08); color:var(--red);">Inactive</span>`;
      return `
        <tr>
          <td style="font-weight:700;">${escapeHtml(f.question)}</td>
          <td>${escapeHtml(f.answer)}</td>
          <td>${f.order}</td>
          <td>${statusPill}</td>
          <td style="text-align:right;">
            ${IS_GOD_MODE ? "" : `
              <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:10px;">
                <button type="button" class="admin-btn" onclick="window.toggleFaq('${f.id}')">Toggle</button>
                <button type="button" class="admin-btn danger-btn" onclick="window.deleteFaq('${f.id}')">Delete</button>
              </div>
            `}
          </td>
        </tr>
      `;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--red);">Failed to load FAQ entries.</td></tr>`;
    console.error(e);
  }
}

window.toggleFaq = async function(id) {
  try {
    const res = await fetch("/api/admin/faq/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) loadFaqTab();
  } catch (err) {
    console.error(err);
  }
};

window.deleteFaq = async function(id) {
  if (!(await siteConfirm("Delete this FAQ item?", { title: "Delete FAQ", confirmLabel: "Delete" }))) return;
  try {
    const res = await fetch("/api/admin/faq", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) loadFaqTab();
  } catch (err) {
    console.error(err);
  }
};

document.getElementById("openNewFaqModalBtn")?.addEventListener("click", () => {
  document.getElementById("faqFormStatus").textContent = "";
  document.getElementById("createFaqForm").reset();
  document.getElementById("faqFormModalOverlay").classList.add("active");
});
document.getElementById("closeFaqFormModal")?.addEventListener("click", () => {
  document.getElementById("faqFormModalOverlay").classList.remove("active");
});
document.getElementById("cancelFaqFormBtn")?.addEventListener("click", () => {
  document.getElementById("faqFormModalOverlay").classList.remove("active");
});
document.getElementById("createFaqForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = document.getElementById("faqQuestionInput").value.trim();
  const answer = document.getElementById("faqAnswerInput").value.trim();
  const order = parseInt(document.getElementById("faqOrderInput").value) || 1;
  const status = document.getElementById("faqFormStatus");

  try {
    const res = await fetch("/api/admin/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, order })
    });
    const data = await res.json();
    if (!res.ok) {
      status.textContent = data.error || "Failed to save FAQ.";
      return;
    }
    document.getElementById("faqFormModalOverlay").classList.remove("active");
    loadFaqTab();
  } catch (err) {
    status.textContent = "Network error.";
  }
});

// =========================================================================
// LEGAL PAGES TAB
// =========================================================================
async function loadPagesTab() {
  try {
    const res = await fetch("/api/admin/pages");
    const data = await res.json();
    const pages = data.pages || {};
    
    document.getElementById("tosContentEditor").value = pages.tos?.content || "";
    document.getElementById("privacyContentEditor").value = pages.privacy?.content || "";
  } catch (e) {
    console.error("Failed to load legal pages content", e);
  }
}

async function savePageContent(slug, content, statusEl) {
  statusEl.textContent = "Saving...";
  statusEl.style.color = "var(--muted)";
  try {
    const res = await fetch("/api/admin/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, content })
    });
    if (res.ok) {
      statusEl.textContent = "✓ Saved successfully.";
      statusEl.style.color = "var(--green)";
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    } else {
      const err = await res.json();
      statusEl.textContent = err.error || "Save failed.";
      statusEl.style.color = "var(--red)";
    }
  } catch (e) {
    statusEl.textContent = "Network error.";
    statusEl.style.color = "var(--red)";
  }
}

document.getElementById("saveTosEditorBtn")?.addEventListener("click", () => {
  const content = document.getElementById("tosContentEditor").value;
  const status = document.getElementById("tosEditorStatus");
  savePageContent("tos", content, status);
});

document.getElementById("savePrivacyEditorBtn")?.addEventListener("click", () => {
  const content = document.getElementById("privacyContentEditor").value;
  const status = document.getElementById("privacyEditorStatus");
  savePageContent("privacy", content, status);
});

// =========================================================================
// AUDIT LOGS TAB
// =========================================================================
let adminAuditLogsAll = [];

async function loadAuditLogsTab() {
  const tbody = document.querySelector("#adminAuditLogRows") || document.querySelector("#adminAuditRows");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="empty" style="text-align:center; padding:24px; color:var(--muted);">Loading audit logs...</td></tr>`;
  try {
    const res = await fetch("/api/admin/audit-logs");
    if (!res.ok) throw new Error("Failed to load audit logs");
    const data = await res.json();
    adminAuditLogsAll = data.logs || [];
    renderAuditLogsTab();
  } catch (e) {
    console.error("loadAuditLogsTab error:", e);
    tbody.innerHTML = `<tr><td colspan="5" class="empty" style="text-align:center; padding:24px; color:var(--red);">Failed to load audit logs.</td></tr>`;
  }
}

function renderAuditLogsTab() {
  const tbody = document.querySelector("#adminAuditLogRows") || document.querySelector("#adminAuditRows");
  if (!tbody) return;
  
  const searchInput = document.querySelector("#adminAuditSearch");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  
  const filtered = adminAuditLogsAll.filter(log => {
    if (query) {
      const hay = [log.id, log.userEmail, log.action, log.details, log.ipAddress].join(" ").toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty" style="text-align:center; padding:24px; color:var(--muted);">No audit logs found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString() : "N/A";
    return `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.03);">
        <td style="font-size:11px; white-space:nowrap; color:rgba(255,255,255,0.7);">${escapeHtml(dateStr)}</td>
        <td>
          <span style="font-weight:600; color:#fff;">${escapeHtml(log.userEmail || 'System')}</span>
          ${log.userId ? `<br><small style="color:rgba(255,255,255,0.35); font-size:10px;">ID: ${escapeHtml(log.userId)}</small>` : ''}
        </td>
        <td>
          <span class="status-pill status-topup" style="font-size:9.5px; font-weight:600;">
            ${escapeHtml(log.action || 'ACTION')}
          </span>
        </td>
        <td style="max-width:320px; word-break:break-word; font-size:11.5px; color:rgba(255,255,255,0.85);">${escapeHtml(log.details || '')}</td>
        <td class="mono" style="font-size:11px; color:rgba(255,255,255,0.55);">${escapeHtml(log.ipAddress || '127.0.0.1')}</td>
      </tr>
    `;
  }).join("");
}

document.getElementById("refreshAuditLogBtn")?.addEventListener("click", loadAuditLogsTab);
document.getElementById("adminAuditSearch")?.addEventListener("input", renderAuditLogsTab);

// =========================================================================
// STAFF REGISTRATION & USER ACTIONS
// =========================================================================
window.toggleUserRole = async function(userId, newRole) {
  if (!(await siteConfirm(`Change this user's role to ${newRole}?`, { title: "Confirm Role Change", confirmLabel: "Change" }))) return;
  try {
    const res = await fetch("/api/admin/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole })
    });
    const data = await res.json();
    if (!res.ok) {
      siteAlert(data.error || "Failed to toggle user role.", { variant: "warn" });
      return;
    }
    refreshAdminData();
  } catch (err) {
    console.error(err);
  }
};

window.deleteUser = async function(userId) {
  if (!(await siteConfirm("Delete this user permanently from the system?", { title: "Delete User", confirmLabel: "Delete" }))) return;
  try {
    const res = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    const data = await res.json();
    if (!res.ok) {
      siteAlert(data.error || "Failed to delete user.", { variant: "warn" });
      return;
    }
    refreshAdminData();
  } catch (err) {
    console.error(err);
  }
};

document.getElementById("openNewStaffModalBtn")?.addEventListener("click", () => {
  const status = document.getElementById("staffFormStatus");
  if (status) status.textContent = "";
  document.getElementById("createStaffForm")?.reset();
  document.getElementById("staffFormModalOverlay")?.classList.add("active");
});
document.getElementById("closeStaffFormModal")?.addEventListener("click", () => {
  document.getElementById("staffFormModalOverlay")?.classList.remove("active");
});
document.getElementById("cancelStaffFormBtn")?.addEventListener("click", () => {
  document.getElementById("staffFormModalOverlay")?.classList.remove("active");
});
document.getElementById("createStaffForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById("staffEmailInput");
  const passwordInput = document.getElementById("staffPasswordInput");
  const status = document.getElementById("staffFormStatus");
  if (!emailInput || !passwordInput) return;
  
  if (status) {
    status.textContent = "Creating...";
    status.style.color = "var(--muted)";
  }
  
  try {
    const res = await fetch("/api/admin/users/create-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });
    const data = await res.json();
    if (!res.ok) {
      if (status) {
        status.textContent = data.error || "Failed to create staff.";
        status.style.color = "var(--red)";
      }
      return;
    }
    if (status) {
      status.textContent = "Staff account created successfully!";
      status.style.color = "#22c55e";
    }
    setTimeout(() => {
      document.getElementById("staffFormModalOverlay")?.classList.remove("active");
      if (typeof refreshAdminData === "function") refreshAdminData();
    }, 800);
  } catch (err) {
    if (status) {
      status.textContent = "Network error. Try again.";
      status.style.color = "var(--red)";
    }
  }
});