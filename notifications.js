// Notifications Handler for Falcon Logs

let notifPage = 1;
let notifTotal = 0;
let notifTotalPages = 1;
let notifUnread = 0;
const NOTIF_PER_PAGE = 20;

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notifTypeMeta(type) {
  const map = {
    ticket_reply: { label: 'Support', cls: 'processing' },
    ticket_refund: { label: 'Refund', cls: 'refunded' },
    ticket_replacement: { label: 'Replacement', cls: 'fulfilled' },
    ticket_closed: { label: 'Ticket', cls: 'expired' },
    order_fulfilled: { label: 'Order', cls: 'fulfilled' },
    order_refund: { label: 'Refund', cls: 'refunded' },
    auto_refund: { label: 'Refund', cls: 'refunded' },
    balance_topup: { label: 'Balance', cls: 'fulfilled' },
    balance_adjustment: { label: 'Balance', cls: 'processing' },
  };
  return map[type] || { label: 'Update', cls: 'pending' };
}

function formatShopDateTime(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch (_) {
    return dateStr;
  }
}

async function markNotificationRead(id, link) {
  try {
    await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    notifUnread = Math.max(0, notifUnread - 1);
    const unreadLabel = document.getElementById('notificationsUnreadLabel');
    if (unreadLabel) {
      unreadLabel.textContent = notifUnread > 0 ? ` · ${notifUnread} unread` : '';
    }
  } catch (_) {}
  if (link) window.location.href = link;
}

async function markAllNotificationsRead() {
  try {
    const res = await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.ok) {
      notifUnread = 0;
      loadNotifications();
    }
  } catch (_) {}
}

function renderNotificationsPagination() {
  const ul = document.querySelector('#notificationsPagination ul');
  if (!ul) return;
  if (notifTotalPages <= 1) { ul.innerHTML = ''; return; }
  if (notifPage > notifTotalPages) notifPage = notifTotalPages;
  if (notifPage < 1) notifPage = 1;

  ul.innerHTML = Array.from({ length: notifTotalPages }, (_, i) => {
    const p = i + 1;
    return `<li class="page-item${p === notifPage ? ' active' : ''}">
      <a class="page-link" href="javascript:void(0)" data-page="${p}">${p}</a>
    </li>`;
  }).join('');
}

async function loadNotifications() {
  const area = document.getElementById('notificationsArea');
  const markBtn = document.getElementById('markAllReadBtn');
  if (!area) return;

  try {
    const res = await fetch(`/api/notifications?page=${notifPage}&perPage=${NOTIF_PER_PAGE}`);
    if (!res.ok) {
      area.innerHTML = `<div class="bordered-box p-4 text-center" style="background: #212121; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.45); font-size: 14px;">
        No notifications found. Order updates, support replies, and balance deposits will appear here.
      </div>`;
      return;
    }

    const d = await res.json();
    const items = d.notifications || [];
    notifTotal = d.total ?? items.length;
    notifUnread = d.unread ?? 0;
    notifTotalPages = d.totalPages ?? 1;

    const countFound = document.getElementById('notificationsFound');
    if (countFound) countFound.textContent = notifTotal;

    const unreadLabel = document.getElementById('notificationsUnreadLabel');
    if (unreadLabel) {
      unreadLabel.textContent = notifUnread > 0 ? ` · ${notifUnread} unread` : '';
    }
    if (markBtn) markBtn.style.display = notifUnread > 0 ? '' : 'none';

    if (!items.length) {
      area.innerHTML = `<div class="bordered-box p-4 text-center" style="background: #212121; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.45); font-size: 14px;">
        No notifications yet. Order updates, support replies, and balance deposits will appear here.
      </div>`;
      renderNotificationsPagination();
      return;
    }

    area.innerHTML = `<div class="notifications-list">${items.map(n => {
      const meta = notifTypeMeta(n.type);
      const unread = !n.read_at;
      const linkAttr = n.link ? `data-link="${escHtml(n.link)}"` : '';
      return `
        <div class="notification-item${unread ? ' unread' : ''}" data-id="${escHtml(n.id)}" ${linkAttr} role="button" tabindex="0">
          <div class="notification-item-head">
            <span class="badge-status ${meta.cls}">${escHtml(meta.label)}</span>
            <span class="notification-item-time">${formatShopDateTime(n.created_at)}</span>
          </div>
          <div class="notification-item-title">${escHtml(n.title)}</div>
          <div class="notification-item-message">${escHtml(n.message)}</div>
        </div>`;
    }).join('')}</div>`;

    renderNotificationsPagination();
  } catch (err) {
    area.innerHTML = `<div class="bordered-box p-4 text-center text-danger" style="background: #212121; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); font-size: 14px;">
      Unable to load notifications at this time.
    </div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('markAllReadBtn')?.addEventListener('click', markAllNotificationsRead);

  document.getElementById('notificationsPagination')?.addEventListener('click', (e) => {
    const link = e.target.closest('[data-page]');
    if (!link) return;
    notifPage = parseInt(link.dataset.page, 10) || 1;
    loadNotifications();
  });

  document.getElementById('notificationsArea')?.addEventListener('click', (e) => {
    const item = e.target.closest('.notification-item');
    if (!item) return;
    markNotificationRead(item.dataset.id, item.dataset.link || null);
  });

  document.getElementById('notificationsArea')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.notification-item');
    if (!item) return;
    e.preventDefault();
    markNotificationRead(item.dataset.id, item.dataset.link || null);
  });

  loadNotifications();
});
