// ── Support page ──────────────────────────────────────────────────────────────

let selectedOrderId = null;
let selectedOrderItemId = null;
let proofImages = [];
let orderWarranty = null;

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

async function loadSupportIssues() {
  const opts = document.querySelector('#issueSelectWrapper .custom-options');
  if (!opts) return;
  try {
    const d = await apiFetch('/api/support/issues');
    const issues = d.issues || [];
    opts.innerHTML = issues.length
      ? issues.map((i) => `<div class="custom-option" data-value="${escAttr(i.label)}">${escHtml(i.label)}</div>`).join('')
      : '<div class="custom-option" data-value="">No issue types configured</div>';
  } catch {
    opts.innerHTML = '<div class="custom-option" data-value="">Could not load issue types</div>';
  }
}

function formatRemainingMs(ms) {
  if (ms <= 0) return '0m';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function renderWarrantyNotice() {
  let el = document.getElementById('warrantyNotice');
  if (!el) {
    const anchor = document.getElementById('order-id-input')?.closest('.input-group');
    if (!anchor) return;
    el = document.createElement('div');
    el.id = 'warrantyNotice';
    el.className = 'mb-3';
    anchor.insertAdjacentElement('afterend', el);
  }
  if (!orderWarranty) {
    el.innerHTML = '';
    return;
  }
  if (orderWarranty.warrantyExpired) {
    el.innerHTML = `<div class="bordered-box p-2" style="border-color:rgba(220,53,69,.45);background:rgba(220,53,69,.08);font-size:13px">
      <strong style="color:#dc3545">Warranty expired.</strong>
      Support tickets must be submitted within ${orderWarranty.warrantyMinutes} minutes of delivery.
    </div>`;
    return;
  }
  el.innerHTML = `<div class="bordered-box p-2" style="border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.08);font-size:13px">
    <strong style="color:#4ade80">Warranty active.</strong>
    You have <span id="warrantyCountdown">${formatRemainingMs(orderWarranty.warrantyRemainingMs)}</span>
    left to submit a ticket (${orderWarranty.warrantyMinutes} minute window from delivery).
  </div>`;
}

function startWarrantyCountdown() {
  if (!orderWarranty || orderWarranty.warrantyExpired) return;
  if (orderWarranty._timer) clearInterval(orderWarranty._timer);
  orderWarranty._timer = setInterval(() => {
    if (!orderWarranty?.warrantyExpiresAt) return;
    const remaining = new Date(orderWarranty.warrantyExpiresAt).getTime() - Date.now();
    orderWarranty.warrantyRemainingMs = Math.max(0, remaining);
    if (remaining <= 0) {
      orderWarranty.warrantyExpired = true;
      clearInterval(orderWarranty._timer);
      setFieldsEnabled(false);
      renderWarrantyNotice();
      showToast('Support warranty has expired for this order', 'error');
      return;
    }
    const countdown = document.getElementById('warrantyCountdown');
    if (countdown) countdown.textContent = formatRemainingMs(remaining);
  }, 1000);
}

function ticketStatusClass(status) {
  if (status === 'open') return 'pending';
  if (status === 'replied') return 'processing';
  return 'fulfilled';
}

function setFieldsEnabled(enabled) {
  const fields = [
    document.getElementById('productSelectWrapper'),
    document.getElementById('issueSelectWrapper'),
    document.getElementById('replacementsCount'),
    document.getElementById('newImageProofInput'),
    document.getElementById('message'),
    document.getElementById('btnSubmitTicket'),
  ];
  fields.forEach(el => {
    if (!el) return;
    if (enabled) el.removeAttribute('disabled');
    else el.setAttribute('disabled', '');
  });
  const fu = document.getElementById('fileUpload');
  if (fu) fu.dataset.disabled = enabled ? 'false' : 'true';
}

// ── Submit Order ID ────────────────────────────────────────────────────────────

document.getElementById('btnSubmitOrderId')?.addEventListener('click', async () => {
  const orderId = document.getElementById('order-id-input').value.trim();
  if (!orderId || orderId.length < 4) { showToast('Invalid order ID format', 'error'); return; }

  try {
    const d = await apiFetch(`/api/support/order/${orderId}`);
    selectedOrderId = orderId;
    orderWarranty = {
      warrantyMinutes: d.warrantyMinutes,
      warrantyExpiresAt: d.warrantyExpiresAt,
      warrantyExpired: d.warrantyExpired,
      warrantyRemainingMs: d.warrantyRemainingMs,
    };

    if (d.order.reason === 'charge') {
      showToast("You can't submit tickets for charge orders", 'error');
      orderWarranty = null;
      return;
    }

    if (d.order.status !== 'fulfilled') {
      showToast('Support tickets are only available for fulfilled orders', 'error');
      orderWarranty = null;
      setFieldsEnabled(false);
      renderWarrantyNotice();
      return;
    }

    if (orderWarranty.warrantyExpired) {
      showToast(`Support warranty expired (${orderWarranty.warrantyMinutes} minute window from delivery)`, 'error');
      setFieldsEnabled(false);
      renderWarrantyNotice();
      return;
    }

    // Populate product select
    const wrapper = document.getElementById('productSelectWrapper');
    const opts = wrapper.querySelector('.custom-options');
    opts.innerHTML = d.items.map(item => `
      <div class="custom-option" data-value="${item.id}" data-product-title="${escHtml(item.product_title)}">${escHtml(item.product_title)} [${escHtml(item.option_name)}]</div>
    `).join('');
    wrapper.querySelector('.custom-select-display').textContent = 'Select product...';
    wrapper.removeAttribute('disabled');

    renderWarrantyNotice();
    startWarrantyCountdown();
    showToast('Order found! Select a product.', 'success');
  } catch (err) {
    orderWarranty = null;
    renderWarrantyNotice();
    showToast('Order not found: ' + err.message, 'error');
  }
});

// ── Product select ────────────────────────────────────────────────────────────

document.getElementById('productSelectWrapper')?.addEventListener('change', () => {
  const display = document.querySelector('#productSelectWrapper .custom-select-display');
  selectedOrderItemId = display.dataset.value;
  if (selectedOrderItemId) {
    const issueWrapper = document.getElementById('issueSelectWrapper');
    issueWrapper.removeAttribute('disabled');
    document.getElementById('replacementsCount').removeAttribute('disabled');
    document.getElementById('newImageProofInput').removeAttribute('disabled');
    document.getElementById('message').removeAttribute('disabled');
    document.getElementById('btnSubmitTicket').removeAttribute('disabled');
    const fu = document.getElementById('fileUpload');
    if (fu) fu.dataset.disabled = 'false';
  }
});

// ── Proof images (upload on file pick) ────────────────────────────────────────

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

document.getElementById('newImageProofInput')?.addEventListener('change', async (e) => {
  const input = e.target;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const status = document.getElementById('uploadFilename');
  let uploaded = 0;
  if (status) status.textContent = `Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`;

  for (const file of files) {
    if (!ALLOWED_MIME.includes(file.type)) {
      showToast(`Skipped ${file.name}: only JPG PNG GIF or WEBP`, 'error');
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast(`Skipped ${file.name}: max 5MB`, 'error');
      continue;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/api/support/upload-image', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');
      proofImages.push(data.url);
      renderProofImages();
      uploaded++;
    } catch (err) {
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  }
  if (status) {
    status.textContent = proofImages.length
      ? `${proofImages.length} file${proofImages.length > 1 ? 's' : ''} attached`
      : 'No file chosen';
  }
  // Reset so picking the same file again still fires `change`
  input.value = '';
});

function renderProofImages() {
  const container = document.getElementById('proofImages');
  container.innerHTML = proofImages.map((url, i) => `
    <div class="d-flex align-items-center mb-2 gap-2">
      <img src="${escHtml(url)}" style="width:60px;height:40px;object-fit:cover;border-radius:4px" onerror="this.style.display='none'">
      <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(url.split('/').pop())}</span>
      <button class="btn btn-danger btn-sm" onclick="removeProofImage(${i})" style="padding:2px 8px">✕</button>
    </div>
  `).join('');
}

function removeProofImage(i) {
  proofImages.splice(i, 1);
  renderProofImages();
  const status = document.getElementById('uploadFilename');
  if (status) {
    status.textContent = proofImages.length
      ? `${proofImages.length} file${proofImages.length > 1 ? 's' : ''} attached`
      : 'No file chosen';
  }
}

// ── Submit ticket ─────────────────────────────────────────────────────────────

document.getElementById('formSubmitTicket')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const understood = document.getElementById('iUnderstandCheckBox').checked;
  if (!understood) { showToast('Please confirm you have read the instructions', 'error'); return; }
  if (!selectedOrderId) { showToast('Please enter a valid order ID', 'error'); return; }
  if (orderWarranty?.warrantyExpired) {
    showToast(`Support warranty expired (${orderWarranty.warrantyMinutes} minute window from delivery)`, 'error');
    return;
  }

  const issueDisplay = document.querySelector('#issueSelectWrapper .custom-select-display');
  const issueType = issueDisplay?.dataset.value;
  if (!issueType) { showToast('Please select an issue type', 'error'); return; }

  const message = document.getElementById('message').value.trim();
  if (!message) { showToast('Please write a message', 'error'); return; }
  if (!proofImages.length) { showToast('Please attach at least one photo as proof', 'error'); return; }

  const btn = document.getElementById('btnSubmitTicket');
  btn.textContent = 'Submitting...';
  btn.disabled = true;

  try {
    await apiFetch('/api/support/submit', {
      method: 'POST',
      body: {
        orderId: selectedOrderId,
        orderItemId: selectedOrderItemId,
        issueType,
        replacementsCount: document.getElementById('replacementsCount').value,
        message,
        images: proofImages
      }
    });
    showToast('Ticket submitted successfully!', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    showToast(err.message, 'error');
    btn.textContent = 'Submit';
    btn.disabled = false;
  }
});

// ── History tab ───────────────────────────────────────────────────────────────

let historyPage = 1;
let historyTotal = 0;
let historyTotalPages = 1;
const HISTORY_PER_PAGE = 25;

document.getElementById('tabHistoryLabel')?.addEventListener('click', () => {
  historyPage = 1;
  loadTicketHistory();
});

document.getElementById('ticketHistoryArea')?.addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-ticket-id]');
  if (row) viewTicket(row.dataset.ticketId);
});

function renderTicketHistoryPagination() {
  const ul = document.querySelector('#ticketHistoryPagination ul');
  if (!ul) return;
  if (historyTotalPages <= 1) { ul.innerHTML = ''; return; }
  if (historyPage > historyTotalPages) historyPage = historyTotalPages;
  if (historyPage < 1) historyPage = 1;

  ul.innerHTML = Array.from({ length: historyTotalPages }, (_, i) => {
    const n = i + 1;
    return `<li class="page-item">
      <button type="button" class="btn ${n === historyPage ? 'btn-primary' : 'btn-secondary'}" onclick="goTicketHistoryPage(${n})" aria-label="Page ${n}" aria-current="${n === historyPage ? 'page' : 'false'}">${n}</button>
    </li>`;
  }).join('');
}

function goTicketHistoryPage(n) {
  historyPage = n;
  loadTicketHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function viewTicket(id) {
  const modalEl = document.getElementById('ticketDetailModal');
  const body = document.getElementById('ticketDetailModalBody');
  const title = document.getElementById('ticketDetailModalTitle');
  if (!modalEl || !body) return;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  body.innerHTML = '<div class="loading"></div>';

  try {
    const d = await apiFetch(`/api/support/tickets/${id}`);
    const { ticket, images } = d;
    const productLabel = ticket.product_title
      ? `${ticket.product_title}${ticket.option_name ? ` [${ticket.option_name}]` : ''}`
      : null;

    title.textContent = `Ticket #${ticket.id.substring(0, 8)}`;

    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">SUBMITTED</div>
          <div style="font-size:13px">${formatShopDateTime(ticket.created_at)}</div>
          ${ticket.updated_at && ticket.updated_at !== ticket.created_at
            ? `<div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:6px">LAST UPDATED</div>
               <div style="font-size:13px">${formatShopDateTime(ticket.updated_at)}</div>`
            : ''}
        </div>
        <span class="badge-status ${ticketStatusClass(ticket.status)}">${escHtml(ticket.status)}</span>
      </div>

      <div class="bordered-box p-2 mb-3">
        <div class="d-flex justify-content-between" style="font-size:12px">
          <span style="color:rgba(255,255,255,.5)">Order ID</span>
          <span style="font-family:monospace">${escHtml(ticket.order_id)}</span>
        </div>
        ${productLabel ? `<div class="d-flex justify-content-between mt-1" style="font-size:12px">
          <span style="color:rgba(255,255,255,.5)">Product</span>
          <span class="text-end ms-2">${escHtml(productLabel)}</span>
        </div>` : ''}
        <div class="d-flex justify-content-between mt-1" style="font-size:12px">
          <span style="color:rgba(255,255,255,.5)">Issue</span>
          <span class="text-end ms-2">${escHtml(ticket.issue_type)} · ${ticket.replacements_count} replacement(s)</span>
        </div>
      </div>

      <div class="mb-3">
        <label style="font-size:11px;color:rgba(255,255,255,.5)">YOUR MESSAGE</label>
        <div style="background:#1a1a1a;border-radius:5px;padding:10px;font-size:13px;white-space:pre-wrap;max-height:200px;overflow-y:auto">${escHtml(ticket.message)}</div>
      </div>

      ${images.length ? `<div class="mb-3">
        <label style="font-size:11px;color:rgba(255,255,255,.5)">PROOF IMAGES</label>
        <div class="d-flex gap-2 flex-wrap">
          ${images.map(img => `<a href="${escHtml(img.image_url)}" target="_blank" rel="noopener"><img src="${escHtml(img.image_url)}" style="width:80px;height:80px;object-fit:cover;border-radius:4px" alt="Proof"></a>`).join('')}
        </div>
      </div>` : ''}

      ${ticket.replacement_content && ticket.replacement_content.trim() ? `<div class="mb-3">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <label style="font-size:11px;color:rgba(255,255,255,.5);margin:0">YOUR REPLACEMENTS</label>
          <button class="btn btn-secondary btn-sm copy-btn" onclick="copyContent('ticket-replacements-${escHtml(ticket.id)}')">Copy All</button>
        </div>
        <div id="ticket-replacements-${escHtml(ticket.id)}" style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);border-radius:5px;padding:10px">
          ${ticket.replacement_content.trim().split('\n').map(line => `<div class="delivered-item">${escHtml(line)}</div>`).join('')}
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:6px">
          Also available on your <a href="/dashboard/orders#replacements" class="text-success">Orders</a> page.
          ${ticket.replacement_order_id ? `<br>Replacement order ID:
            <span style="font-family:monospace;color:#4ade80">${escHtml(ticket.replacement_order_id)}</span>
            — <a href="/support?order=${encodeURIComponent(ticket.replacement_order_id)}" class="text-success">open a ticket</a> if needed.` : ''}
        </div>
      </div>` : ticket.status === 'closed' && ticket.replacement_order_id
        ? `<div class="mb-3" style="font-size:12px;color:rgba(255,255,255,.55)">
            Replacement sent. Your new order ID is
            <span style="font-family:monospace;color:#4ade80">${escHtml(ticket.replacement_order_id)}</span>.
            <a href="/support?order=${encodeURIComponent(ticket.replacement_order_id)}" class="text-success">Open a ticket</a>
            if you need help with the replacement keys.
          </div>`
        : ticket.status === 'closed' && (ticket.admin_reply || '').includes('[Admin] Replaced')
        ? `<div class="mb-3" style="font-size:12px;color:rgba(255,255,255,.45)">Replacement sent. Open this order on your <a href="/dashboard/orders#replacements" class="text-success">Orders</a> page to view delivered items.</div>`
        : ''}

      <div class="mb-2">
        <label style="font-size:11px;color:rgba(255,255,255,.5)">STAFF RESPONSE</label>
        ${ticket.admin_reply && ticket.admin_reply.trim()
          ? `<div style="background:rgba(176,30,183,.12);border:1px solid rgba(176,30,183,.25);border-radius:5px;padding:10px;font-size:13px;white-space:pre-wrap;max-height:240px;overflow-y:auto">${escHtml(ticket.admin_reply.trim())}</div>`
          : `<div style="background:#1a1a1a;border-radius:5px;padding:10px;font-size:13px;color:rgba(255,255,255,.45)">No response yet. Our staff will review your ticket soon.</div>`}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<p class="text-danger">${escHtml(err.message)}</p>`;
  }
}

async function loadTicketHistory() {
  const area = document.getElementById('ticketHistoryArea');
  area.innerHTML = '<div class="loading"></div>';
  try {
    const params = new URLSearchParams({
      page: String(historyPage),
      perPage: String(HISTORY_PER_PAGE),
    });
    const d = await apiFetch('/api/support/tickets?' + params);
    const tickets = d.tickets || [];
    historyTotal = d.total ?? tickets.length;
    historyTotalPages = d.totalPages ?? Math.max(1, Math.ceil(historyTotal / HISTORY_PER_PAGE));
    if (historyPage > historyTotalPages) historyPage = historyTotalPages;
    if (historyPage < 1) historyPage = 1;

    const countEl = document.getElementById('ticketHistoryFound');
    if (countEl) countEl.textContent = historyTotal;

    if (!tickets.length) {
      area.innerHTML = '<p class="text-center py-4" style="color:rgba(255,255,255,.4)">No support tickets yet</p>';
      renderTicketHistoryPagination();
      return;
    }
    area.innerHTML = `
      <p class="text-center mb-2" style="font-size:12px;color:rgba(255,255,255,.45)">Click a ticket to view status and staff response</p>
      <div class="table-responsive">
        <table class="table table-dark table-hover table-sm">
          <thead><tr><th>ID</th><th>Order</th><th>Issue</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody>
            ${tickets.map(t => `
              <tr data-ticket-id="${escHtml(t.id)}" style="cursor:pointer" title="View ticket details">
                <td style="font-size:11px;font-family:monospace">${escHtml(t.id.substring(0,8))}...</td>
                <td style="font-size:11px;font-family:monospace">${escHtml(t.order_id.substring(0,8))}...</td>
                <td>${escHtml(t.issue_type)}</td>
                <td><span class="badge-status ${ticketStatusClass(t.status)}">${escHtml(t.status)}</span></td>
                <td style="font-size:11px">${formatShopDate(t.created_at)}</td>
                <td style="font-size:11px;color:#ea580c;white-space:nowrap">View →</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    renderTicketHistoryPagination();
  } catch (err) {
    area.innerHTML = `<p class="text-danger">${err.message}</p>`;
    renderTicketHistoryPagination();
  }
}

function copyContent(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const text = Array.from(el.querySelectorAll('.delivered-item')).map(d => d.textContent.trim()).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
}

// Disable submit button initially
setFieldsEnabled(false);
loadSupportIssues();

const prefilledOrderId = new URLSearchParams(window.location.search).get('order');
if (prefilledOrderId) {
  const input = document.getElementById('order-id-input');
  if (input) {
    input.value = prefilledOrderId.trim();
    if (prefilledOrderId.trim().length >= 4) {
      document.getElementById('btnSubmitOrderId')?.click();
    }
  }
}
