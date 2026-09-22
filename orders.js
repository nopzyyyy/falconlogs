// ── Orders page ────────────────────────────────────────────────────────────────

let allOrders = [];
let searchTimer;
let replacementSearchTimer;
let currentPage = 1;
let totalOrders = 0;
let totalPages = 1;
const PER_PAGE = 10;

let allReplacements = [];
let replacementsPage = 1;
let replacementsTotal = 0;
let replacementsTotalPages = 1;
let activeReplacement = null;
let warrantyTicker = null;
let modalWarrantyOrderId = null;

const ORDERS_MOBILE_MQ = typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 991.98px)')
  : null;

function isOrdersMobileView() {
  return ORDERS_MOBILE_MQ ? ORDERS_MOBILE_MQ.matches : window.innerWidth <= 991;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function formatWarrantyDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1) return 'warranty window';
  if (m === 60) return '1 hour';
  if (m % 60 === 0) return `${m / 60} hours`;
  return `${m} minutes`;
}

function formatWarrantyCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function warrantyBadgeHtml(order) {
  if (order.status !== 'fulfilled') {
    return '<span class="warranty-badge warranty-badge--pending">After delivery</span>';
  }
  if (order.warrantyExpired) {
    return '<span class="warranty-badge warranty-badge--expired">Expired</span>';
  }
  if (order.warrantyExpiresAt) {
    const mins = order.warrantyMinutes || SUPPORT_WARRANTY_MINUTES;
    return `<span class="warranty-badge warranty-badge--active" data-warranty-expires="${escAttr(order.warrantyExpiresAt)}">
      <span class="warranty-badge__duration">${escHtml(formatWarrantyDuration(mins))}</span>
      <span class="warranty-countdown-live">${formatWarrantyCountdown(order.warrantyRemainingMs || 0)}</span>
    </span>`;
  }
  return '<span class="warranty-badge warranty-badge--pending">—</span>';
}

function renderOrderWarrantyPanel(order) {
  if (order.status !== 'fulfilled') {
    return `<div class="order-warranty-panel order-warranty-panel--pending">
      <div class="order-warranty-panel__head">
        <span>Support warranty</span>
      </div>
      <p>Your <strong>${escHtml(formatWarrantyDuration(order.warrantyMinutes || SUPPORT_WARRANTY_MINUTES))}</strong> support window starts once this order is delivered.</p>
    </div>`;
  }
  if (order.warrantyExpired) {
    return `<div class="order-warranty-panel order-warranty-panel--expired">
      <div class="order-warranty-panel__head">
        <span>Support warranty expired</span>
      </div>
      <p>The ${escHtml(formatWarrantyDuration(order.warrantyMinutes || SUPPORT_WARRANTY_MINUTES))} support window for this order has ended.</p>
    </div>`;
  }
  const mins = order.warrantyMinutes || SUPPORT_WARRANTY_MINUTES;
  return `<div class="order-warranty-panel order-warranty-panel--active" data-warranty-expires="${escAttr(order.warrantyExpiresAt)}">
    <div class="order-warranty-panel__head">
      <span>⏱ ${escHtml(formatWarrantyDuration(mins))} support warranty</span>
      <strong class="warranty-countdown-live order-warranty-panel__timer">${formatWarrantyCountdown(order.warrantyRemainingMs || 0)}</strong>
    </div>
    <p>Open a support ticket before the timer runs out if something is wrong with your order.</p>
    <a href="/support" class="btn btn-success btn-sm">Open Support Ticket</a>
  </div>`;
}

function ensureWarrantyTicker() {
  if (warrantyTicker) return;
  warrantyTicker = setInterval(() => {
    document.querySelectorAll('[data-warranty-expires]').forEach((el) => {
      const expires = el.dataset.warrantyExpires;
      if (!expires) return;
      const remaining = new Date(expires).getTime() - Date.now();
      const countdownEl = el.querySelector('.warranty-countdown-live');
      if (!countdownEl) return;
      if (remaining <= 0) {
        countdownEl.textContent = '00:00';
        el.classList.remove('warranty-badge--active', 'order-warranty-panel--active');
        el.classList.add('warranty-badge--expired', 'order-warranty-panel--expired');
        return;
      }
      countdownEl.textContent = formatWarrantyCountdown(remaining);
    });

    if (modalWarrantyOrderId) {
      const order = allOrders.find((o) => o.id === modalWarrantyOrderId);
      if (order?.warrantyExpiresAt) {
        const remaining = new Date(order.warrantyExpiresAt).getTime() - Date.now();
        order.warrantyRemainingMs = Math.max(0, remaining);
        if (remaining <= 0) {
          order.warrantyExpired = true;
          modalWarrantyOrderId = null;
        }
      }
    }
  }, 1000);
}

function syncOrdersPageMode() {
  document.querySelector('.orders-page')?.classList.toggle('orders-mobile-mode', isOrdersMobileView());
}

function formatShortDate(iso) {
  return formatShopDate(iso);
}

function formatShortTime(iso) {
  return formatShopTime(iso);
}

function setOrdersCount(n) {
  document.getElementById('searchBarFound').textContent = n;
  const desktop = document.querySelector('#ordersHistory .orders-desktop-count-num');
  if (desktop) desktop.textContent = n;
}

function setReplacementsCount(n) {
  document.getElementById('replacementsFound').textContent = n;
  const desktop = document.querySelector('#replacementsHistory .orders-desktop-count-num');
  if (desktop) desktop.textContent = n;
}

function renderOrderMobileCard(o) {
  const items = o.items || [];
  const primary = items[0];
  const title = primary ? primary.product_title : (o.first_item_title || o.id.substring(0, 8));
  const variant = primary ? primary.option_name : '-';
  const extra = items.length > 1 ? `<span class="order-mobile-card__more">+${items.length - 1} more</span>` : '';
  const paid = (Number(o.total_amount || 0) - Number(o.refund_amount || 0)).toFixed(2);
  const expected = (Number(o.subtotal || 0) + Number(o.tax_amount || 0)).toFixed(2);
  const statusBadge = o.reason === 'replacement'
    ? '<span class="badge-status fulfilled">replacement</span>'
    : `<span class="badge-status ${escHtml(o.status)}">${escHtml(o.status)}</span>`;

  return `
    <button type="button" class="order-mobile-card" data-orderid="${escHtml(o.id)}" onclick="openOrderModal('${escHtml(o.id)}')">
      <div class="order-mobile-card__top">
        ${statusBadge}
        <time class="order-mobile-card__date" datetime="${escHtml(o.created_at)}">${formatShortDate(o.created_at)} · ${formatShortTime(o.created_at)}</time>
      </div>
      ${o.status === 'fulfilled' ? `<div class="order-mobile-card__warranty">${warrantyBadgeHtml(o)}</div>` : ''}
      <div class="order-mobile-card__body">
        <div class="order-mobile-card__title">${escHtml(title)}${extra}</div>
        <div class="order-mobile-card__variant">${escHtml(variant)}</div>
      </div>
      <div class="order-mobile-card__foot">
        <div class="order-mobile-card__stat">
          <span class="order-mobile-card__stat-label">Paid</span>
          <strong>${CURRENCY_SIGN}${paid}</strong>
        </div>
        <div class="order-mobile-card__stat">
          <span class="order-mobile-card__stat-label">Expected</span>
          <strong>${CURRENCY_SIGN}${expected}</strong>
        </div>
        <span class="order-mobile-card__arrow" aria-hidden="true">›</span>
      </div>
    </button>`;
}

function renderOrderDesktopRow(o) {
  const items = o.items || [];
  const productCell = items.length
    ? items.map(item => {
        const qty = item.quantity > 1 ? ` <span style="opacity:.55">×${item.quantity}</span>` : '';
        return `<div>${escHtml(item.product_title)}${qty}</div>`;
      }).join('')
    : `<span style="opacity:.5">${escHtml(o.first_item_title || o.id.substring(0, 8))}</span>`;
  const variantCell = items.length
    ? items.map(item => {
        const qty = item.quantity > 1 ? ` <span style="opacity:.55">×${item.quantity}</span>` : '';
        return `<div style="color:rgba(255,255,255,.65)">${escHtml(item.option_name)}${qty}</div>`;
      }).join('')
    : '<span style="opacity:.4">-</span>';
  const paid = (Number(o.total_amount || 0) - Number(o.refund_amount || 0)).toFixed(2);
  const expected = (Number(o.subtotal || 0) + Number(o.tax_amount || 0)).toFixed(2);
  const statusBadge = o.reason === 'replacement'
    ? '<span class="badge-status fulfilled">replacement</span>'
    : `<span class="badge-status ${escHtml(o.status)}">${escHtml(o.status)}</span>`;
  return `
    <tr data-orderid="${o.id}" onclick="openOrderModal('${o.id}')">
      <td>${productCell}</td>
      <td>${variantCell}</td>
      <td>${CURRENCY_SIGN}${paid}</td>
      <td>${CURRENCY_SIGN}${expected}</td>
      <td>${statusBadge}</td>
      <td>${warrantyBadgeHtml(o)}</td>
      <td>${formatShopDateTime(o.created_at)}</td>
    </tr>`;
}

function renderReplacementMobileCard(r) {
  const orderLabel = r.is_replacement_order ? 'Replacement order' : 'Original order';
  return `
    <button type="button" class="order-mobile-card order-mobile-card--replacement" data-replacement-id="${r.id}" onclick="openReplacementModal(${r.id})">
      <div class="order-mobile-card__top">
        <span class="badge-status fulfilled">${r.line_count} key${r.line_count === 1 ? '' : 's'}</span>
        <time class="order-mobile-card__date" datetime="${escHtml(r.created_at)}">${formatShortDate(r.created_at)}</time>
      </div>
      <div class="order-mobile-card__body">
        <div class="order-mobile-card__title">${escHtml(r.product_title)}</div>
        <div class="order-mobile-card__variant">${escHtml(r.option_name)}</div>
      </div>
      <div class="order-mobile-card__foot">
        <div class="order-mobile-card__stat order-mobile-card__stat--wide">
          <span class="order-mobile-card__stat-label">${orderLabel}</span>
          <strong class="order-mobile-card__mono">${escHtml(r.order_id.substring(0, 8))}…</strong>
        </div>
        <span class="order-mobile-card__arrow" aria-hidden="true">›</span>
      </div>
    </button>`;
}

function renderReplacementDesktopRow(r) {
  const orderLabel = r.is_replacement_order ? 'Replacement order' : 'Original order';
  return `
    <tr data-replacement-id="${r.id}" onclick="openReplacementModal(${r.id})">
      <td>${escHtml(r.product_title)}</td>
      <td style="color:rgba(255,255,255,.65)">${escHtml(r.option_name)}</td>
      <td><span class="badge-status fulfilled">${r.line_count}</span></td>
      <td style="font-family:monospace;font-size:12px" title="${escAttr(r.order_id)}">${escHtml(r.order_id.substring(0, 8))}…<div style="font-size:10px;color:rgba(255,255,255,.45)">${orderLabel}</div></td>
      <td>${formatShopDateTime(r.created_at)}</td>
    </tr>`;
}

function renderOrdersUI() {
  syncOrdersPageMode();
  const tbody = document.getElementById('ordersTableBody');
  const mobile = document.getElementById('ordersMobileList');
  if (!tbody && !mobile) return;

  if (!allOrders.length) {
    const empty = '<div class="orders-mobile-empty">No orders found</div>';
    if (mobile) mobile.innerHTML = empty;
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4" style="color:rgba(255,255,255,.4)">No orders found</td></tr>';
    return;
  }

  const cards = allOrders.map(renderOrderMobileCard).join('');
  const rows = allOrders.map(renderOrderDesktopRow).join('');
  if (mobile) mobile.innerHTML = cards;
  if (tbody) tbody.innerHTML = rows;
}

function renderReplacementsUI() {
  syncOrdersPageMode();
  const tbody = document.getElementById('replacementsTableBody');
  const mobile = document.getElementById('replacementsMobileList');
  if (!tbody && !mobile) return;

  if (!allReplacements.length) {
    const empty = '<div class="orders-mobile-empty">No replacements yet. Support replacements will show up here.</div>';
    if (mobile) mobile.innerHTML = empty;
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4" style="color:rgba(255,255,255,.4)">No replacements yet. Support replacements will show up here.</td></tr>';
    return;
  }

  const cards = allReplacements.map(renderReplacementMobileCard).join('');
  const rows = allReplacements.map(renderReplacementDesktopRow).join('');
  if (mobile) mobile.innerHTML = cards;
  if (tbody) tbody.innerHTML = rows;
}

function setOrdersLoading() {
  const mobile = document.getElementById('ordersMobileList');
  const tbody = document.getElementById('ordersTableBody');
  const loadingMobile = '<div class="orders-mobile-state"><div class="loading"></div></div>';
  const loadingDesktop = '<tr><td colspan="7" class="text-center py-4"><div class="loading" style="padding:0;display:inline-block;vertical-align:middle;width:24px;height:24px;margin-right:8px"></div> Loading...</td></tr>';
  if (mobile) mobile.innerHTML = loadingMobile;
  if (tbody) tbody.innerHTML = loadingDesktop;
}

function setReplacementsLoading() {
  const mobile = document.getElementById('replacementsMobileList');
  const tbody = document.getElementById('replacementsTableBody');
  const loadingMobile = '<div class="orders-mobile-state"><div class="loading"></div></div>';
  const loadingDesktop = '<tr><td colspan="5" class="text-center py-4"><div class="loading" style="padding:0;display:inline-block;vertical-align:middle;width:24px;height:24px;margin-right:8px"></div> Loading...</td></tr>';
  if (mobile) mobile.innerHTML = loadingMobile;
  if (tbody) tbody.innerHTML = loadingDesktop;
}

async function loadOrders() {
  const params = new URLSearchParams();
  const oid = document.getElementById('searchOrderId')?.value.trim();
  const status = document.querySelector('#statusFilter .custom-select-display')?.dataset.value;
  if (oid) params.set('orderId', oid);
  if (status) params.set('status', status);
  params.set('page', String(currentPage));
  params.set('perPage', String(PER_PAGE));

  setOrdersLoading();
  try {
    const d = await apiFetch('/api/orders?' + params);
    allOrders = d.orders || [];
    totalOrders = d.total ?? allOrders.length;
    totalPages = d.totalPages ?? Math.max(1, Math.ceil(totalOrders / PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    setOrdersCount(totalOrders);
    renderOrdersUI();
    renderPagination();
    ensureWarrantyTicker();
  } catch (err) {
    const msg = escHtml(err.message || 'Failed to load orders');
    const mobile = document.getElementById('ordersMobileList');
    const tbody = document.getElementById('ordersTableBody');
    if (mobile) mobile.innerHTML = `<div class="orders-mobile-empty orders-mobile-empty--error">${msg}</div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${msg}</td></tr>`;
    renderPagination();
  }
}

async function loadReplacements() {
  const params = new URLSearchParams();
  const oid = document.getElementById('searchReplacementOrderId')?.value.trim();
  if (oid) params.set('orderId', oid);
  params.set('page', String(replacementsPage));
  params.set('perPage', String(PER_PAGE));

  setReplacementsLoading();
  try {
    const d = await apiFetch('/api/orders/replacements?' + params);
    allReplacements = d.replacements || [];
    replacementsTotal = d.total ?? allReplacements.length;
    replacementsTotalPages = d.totalPages ?? Math.max(1, Math.ceil(replacementsTotal / PER_PAGE));
    if (replacementsPage > replacementsTotalPages) replacementsPage = replacementsTotalPages;
    if (replacementsPage < 1) replacementsPage = 1;

    setReplacementsCount(replacementsTotal);
    renderReplacementsUI();
    renderReplacementsPagination();
  } catch (err) {
    const msg = escHtml(err.message || 'Failed to load replacements');
    const mobile = document.getElementById('replacementsMobileList');
    const tbody = document.getElementById('replacementsTableBody');
    if (mobile) mobile.innerHTML = `<div class="orders-mobile-empty orders-mobile-empty--error">${msg}</div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">${msg}</td></tr>`;
    renderReplacementsPagination();
  }
}

function renderPagination() {
  const ul = document.querySelector('#paginationContainer ul');
  if (!ul) return;
  if (totalPages <= 1) { ul.innerHTML = ''; return; }
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const prevDisabled = currentPage <= 1 ? 'disabled' : '';
  const nextDisabled = currentPage >= totalPages ? 'disabled' : '';
  const compact = isOrdersMobileView();

  const pageButtons = compact
    ? `<li class="page-item"><span class="orders-page-indicator">${currentPage} / ${totalPages}</span></li>`
    : Array.from({ length: totalPages }, (_, i) => {
        const n = i + 1;
        return `<li class="page-item">
          <button type="button" class="btn ${n === currentPage ? 'btn-primary' : 'btn-secondary'}" onclick="goPage(${n})" aria-label="Page ${n}" aria-current="${n === currentPage ? 'page' : 'false'}">${n}</button>
        </li>`;
      }).join('');

  ul.innerHTML = `
    <li class="page-item">
      <button type="button" class="btn btn-secondary" onclick="goPage(${currentPage - 1})" aria-label="Previous page" ${prevDisabled}>← Prev</button>
    </li>
    ${pageButtons}
    <li class="page-item">
      <button type="button" class="btn btn-secondary" onclick="goPage(${currentPage + 1})" aria-label="Next page" ${nextDisabled}>Next →</button>
    </li>
  `;
}

function renderReplacementsPagination() {
  const ul = document.querySelector('#replacementsPaginationContainer ul');
  if (!ul) return;
  if (replacementsTotalPages <= 1) { ul.innerHTML = ''; return; }
  if (replacementsPage > replacementsTotalPages) replacementsPage = replacementsTotalPages;
  if (replacementsPage < 1) replacementsPage = 1;

  const prevDisabled = replacementsPage <= 1 ? 'disabled' : '';
  const nextDisabled = replacementsPage >= replacementsTotalPages ? 'disabled' : '';
  const compact = isOrdersMobileView();

  const pageButtons = compact
    ? `<li class="page-item"><span class="orders-page-indicator">${replacementsPage} / ${replacementsTotalPages}</span></li>`
    : Array.from({ length: replacementsTotalPages }, (_, i) => {
        const n = i + 1;
        return `<li class="page-item">
          <button type="button" class="btn ${n === replacementsPage ? 'btn-primary' : 'btn-secondary'}" onclick="goReplacementsPage(${n})" aria-label="Page ${n}" aria-current="${n === replacementsPage ? 'page' : 'false'}">${n}</button>
        </li>`;
      }).join('');

  ul.innerHTML = `
    <li class="page-item">
      <button type="button" class="btn btn-secondary" onclick="goReplacementsPage(${replacementsPage - 1})" aria-label="Previous page" ${prevDisabled}>← Prev</button>
    </li>
    ${pageButtons}
    <li class="page-item">
      <button type="button" class="btn btn-secondary" onclick="goReplacementsPage(${replacementsPage + 1})" aria-label="Next page" ${nextDisabled}>Next →</button>
    </li>
  `;
}

function goPage(n) {
  currentPage = n;
  loadOrders();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goReplacementsPage(n) {
  replacementsPage = n;
  loadReplacements();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setStatusFilter(value, label) {
  const display = document.querySelector('#statusFilter .custom-select-display');
  if (display) {
    display.textContent = label || value || 'All';
    display.dataset.value = value;
  }
  document.querySelectorAll('#statusFilterChips .orders-status-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.value === value);
  });
}

async function openOrderModal(orderId) {
  const modal = new bootstrap.Modal(document.getElementById('orderInfoModal'));
  modal.show();
  const body = document.getElementById('orderModalBody');
  body.innerHTML = '<div class="loading"></div>';
  modalWarrantyOrderId = null;

  try {
    const d = await apiFetch(`/api/orders/${orderId}`);
    const { order, items } = d;
    const listOrder = allOrders.find((o) => o.id === orderId);
    if (listOrder) {
      listOrder.warrantyMinutes = order.warrantyMinutes;
      listOrder.warrantyExpiresAt = order.warrantyExpiresAt;
      listOrder.warrantyExpired = order.warrantyExpired;
      listOrder.warrantyRemainingMs = order.warrantyRemainingMs;
    }
    if (order.status === 'fulfilled' && !order.warrantyExpired) {
      modalWarrantyOrderId = orderId;
    }
    ensureWarrantyTicker();

    const itemsHtml = items.map(item => `
      <div class="mb-3">
        <div class="d-flex justify-content-between mb-1">
          <strong>${escHtml(item.product_title)}</strong>
          <span>${CURRENCY_SIGN}${item.price.toFixed(2)} x${item.quantity}</span>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,.6)">${escHtml(item.option_name)}</div>
        ${item.delivered_content ? `
          <div class="mt-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px;color:rgba(255,255,255,.5)">Delivered Items:</span>
              <button class="btn btn-secondary btn-sm copy-btn" onclick="copyContent('content-${item.id}')">Copy All</button>
            </div>
            <div id="content-${item.id}">
              ${item.delivered_content.split('\n').map(line => `<div class="delivered-item">${escHtml(line)}</div>`).join('')}
            </div>
          </div>
        ` : order.status === 'fulfilled' ? '<div style="font-size:12px;color:#dc3545">No content delivered</div>' : ''}
      </div>
    `).join('<hr style="border-color:rgba(255,255,255,.1)">');

    body.innerHTML = `
      ${order.reason === 'replacement' ? `<div class="order-warranty-panel order-warranty-panel--active mb-3">
        <div class="order-warranty-panel__head"><span>Replacement order</span></div>
        <p>Use this order ID on the Support page if something is wrong with these replacement keys.</p>
        <a href="/support?order=${encodeURIComponent(order.id)}" class="btn btn-success btn-sm">Open Support Ticket</a>
      </div>` : ''}
      ${renderOrderWarrantyPanel(order)}
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">Order ID</div>
          <div style="font-size:12px;font-family:monospace">${escHtml(order.id)}</div>
        </div>
        <span class="badge-status ${escHtml(order.status)}">${escHtml(order.status)}</span>
      </div>
      <div class="row mb-3 order-detail-meta">
        <div class="col-12 col-sm-4" style="font-size:12px"><div style="color:rgba(255,255,255,.5)">Total Paid</div><strong>${CURRENCY_SIGN}${order.total_amount.toFixed(2)}</strong></div>
        <div class="col-12 col-sm-4" style="font-size:12px"><div style="color:rgba(255,255,255,.5)">Method</div><strong>${escHtml(order.payment_method)}</strong></div>
        <div class="col-12 col-sm-4" style="font-size:12px"><div style="color:rgba(255,255,255,.5)">Date</div><strong>${formatShopDate(order.created_at)}</strong></div>
      </div>
      <hr style="border-color:rgba(255,255,255,.1)">
      ${itemsHtml}
      ${order.status === 'pending' && order.telegram_pay_link ? `
        <div class="mt-3">
          <a href="${escHtml(order.telegram_pay_link)}" class="btn btn-primary w-100" target="_blank" rel="noopener">Pay with Telegram Stars${order.telegram_stars_amount ? ` (${order.telegram_stars_amount} Stars)` : ''}</a>
        </div>
      ` : ''}
      ${order.status === 'pending' && order.pay_url ? `
        <div class="mt-3">
          <a href="${escHtml(order.pay_url)}" class="btn btn-primary w-100">Complete Payment →</a>
        </div>
      ` : ''}
      ${order.status === 'pending' && !order.pay_url && order.oxapay_pay_link ? `
        <div class="mt-3">
          <a href="${escHtml(order.oxapay_pay_link)}" class="btn btn-primary w-100" target="_blank">Complete Payment →</a>
        </div>
      ` : ''}
    `;
  } catch (err) {
    body.innerHTML = `<p class="text-danger">${escHtml(err.message)}</p>`;
  }
}

function openReplacementModal(itemId) {
  const row = allReplacements.find(r => r.id === itemId);
  if (!row) return;
  activeReplacement = row;

  const modal = new bootstrap.Modal(document.getElementById('replacementInfoModal'));
  modal.show();
  const body = document.getElementById('replacementModalBody');
  const supportLink = row.is_replacement_order
    ? `<a href="/support?order=${encodeURIComponent(row.order_id)}" class="btn btn-success btn-sm">Open Support Ticket</a>`
    : '';

  body.innerHTML = `
    <div class="mb-3">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div>
          <strong>${escHtml(row.product_title)}</strong>
          <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px">${escHtml(row.option_name)}</div>
        </div>
        <span class="badge-status fulfilled">${row.line_count} key${row.line_count === 1 ? '' : 's'}</span>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:10px">
        ${row.is_replacement_order ? 'Replacement order ID' : 'Original order ID'}
        <div style="font-family:monospace;font-size:12px;color:rgba(255,255,255,.85);margin-top:4px;word-break:break-all">${escHtml(row.order_id)}</div>
      </div>
      ${row.is_replacement_order ? `<p style="font-size:12px;color:rgba(255,255,255,.55);margin:10px 0 0">Use this order ID on the Support page if you need help with these replacement keys.</p>` : ''}
      ${row.parent_order_id ? `<div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:6px">Replaces order ${escHtml(row.parent_order_id.substring(0, 8))}…</div>` : ''}
    </div>
    <div id="replacementContentBox" style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);border-radius:6px;padding:10px">
      ${row.replacement_content.trim().split('\n').map(line => `<div class="delivered-item">${escHtml(line)}</div>`).join('')}
    </div>
    ${supportLink ? `<div class="mt-3">${supportLink}</div>` : ''}
  `;
}

function copyContent(containerId) {
  const el = document.getElementById(containerId);
  const text = Array.from(el.querySelectorAll('.delivered-item')).map(d => d.textContent.trim()).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
}

document.getElementById('orderInfoModal')?.addEventListener('hidden.bs.modal', () => {
  modalWarrantyOrderId = null;
});

document.getElementById('copyReplacementBtn')?.addEventListener('click', () => {
  if (!activeReplacement) return;
  const text = activeReplacement.replacement_content.trim();
  navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
});

// ── Mobile status chips ───────────────────────────────────────────────────────

document.getElementById('statusFilterChips')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.orders-status-chip');
  if (!chip) return;
  setStatusFilter(chip.dataset.value, chip.textContent.trim());
  currentPage = 1;
  loadOrders();
});

document.getElementById('statusFilter')?.addEventListener('change', () => {
  const display = document.querySelector('#statusFilter .custom-select-display');
  const value = display?.dataset.value || '';
  setStatusFilter(value, display?.textContent.trim());
  currentPage = 1;
  loadOrders();
});

// ── Search ─────────────────────────────────────────────────────────────────────

document.getElementById('searchOrderId')?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage = 1;
    loadOrders();
  }, 400);
});

document.getElementById('searchReplacementOrderId')?.addEventListener('input', () => {
  clearTimeout(replacementSearchTimer);
  replacementSearchTimer = setTimeout(() => {
    replacementsPage = 1;
    loadReplacements();
  }, 400);
});

document.getElementById('replacementsTabLabel')?.addEventListener('click', () => {
  loadReplacements();
});

function activateReplacementsTab() {
  const tab = document.getElementById('replacementsTabLabel');
  if (!tab) return;
  bootstrap.Tab.getOrCreateInstance(tab).show();
  loadReplacements();
}

function bindOrdersViewportListener(fn) {
  if (!ORDERS_MOBILE_MQ) return;
  if (typeof ORDERS_MOBILE_MQ.addEventListener === 'function') {
    ORDERS_MOBILE_MQ.addEventListener('change', fn);
  } else if (typeof ORDERS_MOBILE_MQ.addListener === 'function') {
    ORDERS_MOBILE_MQ.addListener(fn);
  }
}

function showOrdersBootError(err) {
  const msg = escHtml(err?.message || 'Failed to load orders');
  const mobile = document.getElementById('ordersMobileList');
  const tbody = document.getElementById('ordersTableBody');
  const html = `<div class="orders-mobile-empty orders-mobile-empty--error">${msg}</div>`;
  if (mobile) mobile.innerHTML = html;
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${msg}</td></tr>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

let ordersResizeTimer;
let lastMobileMode = isOrdersMobileView();

function handleOrdersViewportChange() {
  const mobile = isOrdersMobileView();
  syncOrdersPageMode();
  renderPagination();
  renderReplacementsPagination();
  if (mobile !== lastMobileMode) {
    lastMobileMode = mobile;
    if (allOrders.length) renderOrdersUI();
    if (allReplacements.length) renderReplacementsUI();
  }
}

function initOrdersPage() {
  try {
    syncOrdersPageMode();
    bindOrdersViewportListener(handleOrdersViewportChange);
    window.addEventListener('resize', () => {
      if (!document.querySelector('.orders-page')) return;
      clearTimeout(ordersResizeTimer);
      ordersResizeTimer = setTimeout(handleOrdersViewportChange, 150);
    });
    loadOrders();
    if (window.location.hash === '#replacements') {
      activateReplacementsTab();
    }
  } catch (err) {
    console.error('Orders page init failed:', err);
    showOrdersBootError(err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOrdersPage);
} else {
  initOrdersPage();
}
