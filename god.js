(() => {
  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    products: [],
    inventory: [],
    users: [],
    orders: [],
    topups: [],
    refunds: [],
  };
  const expandedOrders = new Set();

  // ── Helpers ────────────────────────────────────────────────────────────
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
  const money = v => '£' + Number(v || 0).toFixed(2);
  const ymd = d => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  };
  const fmtDate = iso => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return String(iso); }
  };
  const shortDate = iso => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return String(iso); }
  };
  const shortId = id => id ? esc(String(id).slice(0, 12)) + '…' : '—';

  function statusChip(s) {
    const v = String(s || '').toUpperCase();
    const map = {
      COMPLETED:    ['chip-green',  'Completed'],
      AVAILABLE:    ['chip-green',  'Available'],
      APPROVED:     ['chip-green',  'Approved'],
      ACTIVE:       ['chip-green',  'Active'],
      WAITING_PAYMENT: ['chip-amber', 'Waiting Payment'],
      CONFIRMING:   ['chip-amber',  'Confirming'],
      PENDING:      ['chip-amber',  'Pending'],
      FAILED:       ['chip-red',    'Failed'],
      EXPIRED:      ['chip-red',    'Expired'],
      DENIED:       ['chip-red',    'Denied'],
      DISMISSED:    ['chip-red',    'Dismissed'],
      SOLD:         ['chip-muted',  'Sold'],
      RESOLVED:     ['chip-muted',  'Resolved'],
    };
    const [cls, label] = map[v] || ['chip-muted', s || '—'];
    return `<span class="god-chip ${cls}">${esc(label)}</span>`;
  }

  // ── Auth ───────────────────────────────────────────────────────────────
  async function checkAuth() {
    try {
      const r = await fetch('/api/auth/me');
      const me = await r.json();
      if (!me.authenticated || me.role !== 'GOD') {
        location.href = '/';
        return false;
      }
      return true;
    } catch { location.href = '/login'; return false; }
  }

  // ── Tab switching ──────────────────────────────────────────────────────
  function initTabs() {
    $$('[data-god-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.godTab;
        $$('[data-god-tab]').forEach(t => t.classList.toggle('active', t === tab));
        $$('.god-section').forEach(s => s.classList.toggle('active', s.id === 'god-' + name));
      });
    });
    $('#godLogoutBtn').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(()=>{});
      location.href = '/login';
    });
  }

  // ── Data loading ───────────────────────────────────────────────────────
  async function loadAll() {
    const [p, i, u, o, t, r] = await Promise.all([
      fetch('/api/products').then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/items').then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/admin/users').then(r => r.json()).catch(() => ({ users: [] })),
      fetch('/api/admin/orders').then(r => r.json()).catch(() => ({ orders: [] })),
      fetch('/api/admin/topups').then(r => r.json()).catch(() => ({ topups: [] })),
      fetch('/api/admin/refunds').then(r => r.json()).catch(() => ({ refunds: [] })),
    ]);
    state.products  = p.products  || [];
    state.inventory = i.items     || [];
    state.users     = u.users     || [];
    state.orders    = o.orders    || [];
    state.topups    = t.topups    || [];
    state.refunds   = r.refunds   || [];

    renderAnalytics();
    renderProducts();
    renderInventory();
    renderUsers();
    renderOrders();
    renderTopups();
    renderRefunds();
  }

  // ── Analytics ──────────────────────────────────────────────────────────
  function renderAnalytics() {
    const completedOrders = state.orders.filter(o => String(o.status).toUpperCase() === 'COMPLETED');
    const completedTopups = state.topups.filter(t => String(t.status).toUpperCase() === 'COMPLETED');
    const todayKey = ymd(new Date());
    const monthKey = todayKey.slice(0, 7);

    let total = 0, today = 0, month = 0, crypto = 0, balance = 0;
    completedOrders.forEach(o => {
      const amt = Number(o.total || 0);
      total += amt;
      const k = ymd(o.createdAt);
      if (k === todayKey) today += amt;
      if (k.startsWith(monthKey)) month += amt;
      if (String(o.paymentMethod).toUpperCase() === 'CRYPTO') crypto += amt;
      else balance += amt;
    });
    completedTopups.forEach(t => {
      const amt = Number(t.amount || 0);
      total += amt;
      const k = ymd(t.createdAt);
      if (k === todayKey) today += amt;
      if (k.startsWith(monthKey)) month += amt;
      crypto += amt;
    });

    $('#kpiTotal').textContent   = money(total);
    $('#kpiToday').textContent   = money(today);
    $('#kpiMonth').textContent   = money(month);
    $('#kpiOrders').textContent  = completedOrders.length;
    $('#kpiCrypto').textContent  = money(crypto);
    $('#kpiBalance').textContent = money(balance);
    $('#kpiUsers').textContent   = state.users.length;
    $('#kpiStock').textContent   = state.inventory.filter(c => !c.isSold).length;

    const recent = [...state.orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 15);
    const tbody = $('#recentOrdersBody');
    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="god-empty">No orders yet.</td></tr>';
    } else {
      tbody.innerHTML = recent.map(o => `
        <tr>
          <td class="god-mono">${shortId(o.id)}</td>
          <td>${esc(o.userEmail || o.userId || '—')}</td>
          <td style="color:var(--green); font-weight:700;">${money(o.total)}</td>
          <td><span class="god-chip chip-muted">${esc(o.paymentMethod || '—')}</span></td>
          <td>${statusChip(o.status)}</td>
          <td style="color:var(--muted);">${shortDate(o.createdAt)}</td>
        </tr>
      `).join('');
    }
  }

  // ── Products ───────────────────────────────────────────────────────────
  function renderProducts() {
    const q = ($('#productSearch').value || '').trim().toLowerCase();
    const list = state.products.filter(p => {
      if (!q) return true;
      return (p.title || '').toLowerCase().includes(q)
          || (p.tags || '').toLowerCase().includes(q)
          || (p.category || '').toLowerCase().includes(q)
          || (p.description || '').toLowerCase().includes(q);
    });
    $('#productsCount').textContent = `${list.length} of ${state.products.length} products`;

    const container = $('#productsListContainer');
    if (!list.length) {
      container.innerHTML = '<div class="god-empty">No products found.</div>';
      return;
    }
    container.innerHTML = list.map(p => {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const totalStock = variants.reduce((sum, v) => sum + (Array.isArray(v.stock) ? v.stock.filter(s => !s.isSold).length : 0), 0);
      const variantsHtml = variants.map(v => {
        const stock = Array.isArray(v.stock) ? v.stock : [];
        const avail = stock.filter(s => !s.isSold);
        const sold  = stock.filter(s =>  s.isSold);
        const stockLines = stock.length
          ? stock.map(s => `<div class="god-stock-line${s.isSold ? ' sold' : ''}">${esc(s.credentials || s.content || '(empty)')}</div>`).join('')
          : '<div class="god-stock-line" style="color:var(--muted); font-style:italic;">No stock lines.</div>';
        return `
          <div class="god-variant">
            <div class="god-variant-head">
              <div>
                <strong>${esc(v.name || 'Unnamed variant')}</strong>
                <span style="color:var(--muted); margin-left:8px; font-size:11px;">${money(v.price)}</span>
              </div>
              <div style="display:flex; gap:6px;">
                <span class="god-chip chip-green">${avail.length} avail</span>
                ${sold.length ? `<span class="god-chip chip-muted">${sold.length} sold</span>` : ''}
              </div>
            </div>
            <div class="god-variant-stock">${stockLines}</div>
          </div>
        `;
      }).join('');

      return `
        <article class="god-product-card">
          <div class="god-product-head">
            ${p.image ? `<img class="god-product-img" src="${esc(p.image)}" onerror="this.style.display='none'">` : `<div class="god-product-img" style="display:grid;place-items:center;color:var(--muted);"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.27 6.96 8.73 5.05 8.73-5.05"/><path d="M12 22.08V12"/></svg></div>`}
            <div class="god-product-info">
              <h3>${esc(p.title)} ${p.isHidden ? '<span class="god-chip chip-red" style="margin-left:8px;">Hidden</span>' : ''}</h3>
              <p>${esc(p.description || 'No description')}</p>
              <div class="god-product-meta">
                <span class="god-chip chip-muted">${esc(p.category || 'Uncategorized')}</span>
                ${(p.tags || '').split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="god-chip chip-muted">${esc(t)}</span>`).join('')}
                <span class="god-chip chip-green">${variants.length} variant${variants.length === 1 ? '' : 's'}</span>
                <span class="god-chip ${totalStock > 0 ? 'chip-green' : 'chip-red'}">${totalStock} in stock</span>
              </div>
            </div>
          </div>
          ${variantsHtml || '<div class="god-empty" style="padding:20px;">No variants.</div>'}
        </article>
      `;
    }).join('');
  }

  // ── Card Inventory ─────────────────────────────────────────────────────
  function renderInventory() {
    const q = ($('#inventorySearch').value || '').trim().toLowerCase();
    const list = state.inventory.filter(c => {
      if (!q) return true;
      return [c.bin, c.pan, c.name, c.base, c.state, c.city, c.zip, c.issuer, c.email]
        .some(f => String(f || '').toLowerCase().includes(q));
    });
    $('#inventoryCount').textContent = `${list.length} of ${state.inventory.length} cards`;

    const tbody = $('#inventoryBody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="17" class="god-empty">No cards.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map((c, idx) => {
      const exp = c.mm && c.yy ? `${esc(c.mm)}/${esc(c.yy)}` : '—';
      const stIdx = state.inventory.indexOf(c);
      return `
        <tr class="god-inventory-row" data-inv-idx="${stIdx}"${c.isSold ? ' style="opacity:0.5;"' : ''}>
          <td class="god-mono" style="color:var(--green); font-weight:700;">${esc(c.bin || '—')}</td>
          <td class="god-mono">${esc(c.pan || '—')}</td>
          <td>${exp}</td>
          <td class="god-mono">${esc(c.cvv || '—')}</td>
          <td>${esc(c.name || '—')}</td>
          <td style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(c.address || '')}">${esc(c.address || '—')}</td>
          <td>${esc(c.city || '—')}</td>
          <td>${esc(c.state || '—')}</td>
          <td class="god-mono">${esc(c.zip || '—')}</td>
          <td class="god-mono">${esc(c.phone || '—')}</td>
          <td style="max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(c.email || '')}">${esc(c.email || '—')}</td>
          <td><span class="god-chip chip-muted">${esc(c.type || '—')}</span></td>
          <td><span class="god-chip chip-amber">${esc(c.level || '—')}</span></td>
          <td style="max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(c.issuer || '')}">${esc(c.issuer || '—')}</td>
          <td style="max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(c.base || '')}">${esc(c.base || '—')}</td>
          <td style="color:var(--green); font-weight:700;">${money(c.price)}</td>
          <td>${c.isSold ? statusChip('SOLD') : statusChip('AVAILABLE')}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.god-inventory-row').forEach(tr => {
      tr.addEventListener('click', () => {
        const c = state.inventory[+tr.dataset.invIdx];
        if (c) openCardModal(c);
      });
    });
  }

  // ── Users ──────────────────────────────────────────────────────────────
  function renderUsers() {
    const q = ($('#usersSearch').value || '').trim().toLowerCase();
    const list = state.users.filter(u => {
      if (!q) return true;
      return (u.email || '').toLowerCase().includes(q)
          || (u.role  || '').toLowerCase().includes(q);
    });
    $('#usersCount').textContent = `${list.length} of ${state.users.length} users`;
    const tbody = $('#usersBody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="god-empty">No users.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(u => {
      const roleChip = u.role === 'ADMIN'
        ? `<span class="god-chip chip-amber">${esc(u.role)}</span>`
        : `<span class="god-chip chip-muted">${esc(u.role)}</span>`;
      return `
        <tr>
          <td>${esc(u.email)}</td>
          <td>${roleChip}</td>
          <td style="color:var(--green); font-weight:700;">${money(u.balance)}</td>
          <td style="color:var(--muted);">${shortDate(u.createdAt)}</td>
          <td class="god-mono" style="color:var(--muted);">${esc(u.id || '—')}</td>
        </tr>
      `;
    }).join('');
  }

  // ── Orders ─────────────────────────────────────────────────────────────
  function flattenOrderItems(order) {
    const cards = [];
    const accounts = [];
    (order.items || []).forEach(item => {
      if (item.type === 'stock') {
        cards.push({ name: item.name, price: item.price, credentials: item.credentials || '' });
      } else {
        const lines = String(item.credentials || '').split(/\r?\n/).filter(Boolean);
        lines.forEach(line => accounts.push({ name: item.name, price: item.price, credentials: line }));
      }
    });
    return { cards, accounts };
  }

  function renderOrders() {
    const q = ($('#ordersSearch').value || '').trim().toLowerCase();
    const list = [...state.orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .filter(o => {
        if (!q) return true;
        return (o.id || '').toLowerCase().includes(q)
            || (o.userEmail || '').toLowerCase().includes(q)
            || (o.userId || '').toLowerCase().includes(q)
            || (o.status || '').toLowerCase().includes(q)
            || (o.paymentMethod || '').toLowerCase().includes(q);
      });
    $('#ordersCount').textContent = `${list.length} of ${state.orders.length} orders`;

    const container = $('#ordersListContainer');
    if (!list.length) {
      container.innerHTML = '<div class="god-empty">No orders.</div>';
      return;
    }
    container.innerHTML = list.map(o => {
      const { cards, accounts } = flattenOrderItems(o);
      const isOpen = expandedOrders.has(o.id);
      const items = (cards.length ? `
        <h4>Cards Delivered (${cards.length})</h4>
        ${cards.map(c => `<div class="god-order-item">${esc(c.name)} — ${money(c.price)}<br><span style="color:var(--muted);">${esc(c.credentials)}</span></div>`).join('')}
      ` : '') + (accounts.length ? `
        <h4>Accounts Delivered (${accounts.length})</h4>
        ${accounts.map(a => `<div class="god-order-item">${esc(a.name)} — ${money(a.price)}<br><span style="color:var(--muted);">${esc(a.credentials)}</span></div>`).join('')}
      ` : '');

      return `
        <article class="god-order-card${isOpen ? ' expanded' : ''}" data-order-id="${esc(o.id)}">
          <div class="god-order-head" data-toggle="${esc(o.id)}">
            <div>
              <svg class="god-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:8px;"><polyline points="9 18 15 12 9 6"/></svg>
              <span class="god-order-user">${esc(o.userEmail || o.userId || 'anon')}</span>
              <div class="god-order-id" style="margin-top:2px; margin-left:20px;">${esc(o.id)}</div>
            </div>
            <span class="god-chip chip-muted">${esc(o.paymentMethod || '—')}</span>
            ${statusChip(o.status)}
            <strong style="color:var(--green); font-size:15px;">${money(o.total)}</strong>
          </div>
          ${isOpen ? `
            <div class="god-order-body">
              <div class="god-order-meta">
                <div class="god-order-meta-cell"><span>User Email</span><strong>${esc(o.userEmail || '—')}</strong></div>
                <div class="god-order-meta-cell"><span>User ID</span><strong>${esc(o.userId || '—')}</strong></div>
                <div class="god-order-meta-cell"><span>Created</span><strong>${fmtDate(o.createdAt)}</strong></div>
                ${o.completedAt ? `<div class="god-order-meta-cell"><span>Completed</span><strong>${fmtDate(o.completedAt)}</strong></div>` : ''}
                ${o.paymentInvoiceId ? `<div class="god-order-meta-cell"><span>Invoice ID</span><strong>${esc(o.paymentInvoiceId)}</strong></div>` : ''}
                ${o.paymentAddress ? `<div class="god-order-meta-cell"><span>Payment Address</span><strong>${esc(o.paymentAddress)}</strong></div>` : ''}
                ${o.payCurrency ? `<div class="god-order-meta-cell"><span>Pay Currency</span><strong>${esc(o.payCurrency.toUpperCase())}</strong></div>` : ''}
              </div>
              <div class="god-order-items">${items || '<div style="color:var(--muted); font-size:12px;">No delivered items.</div>'}</div>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');

    container.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.toggle;
        if (expandedOrders.has(id)) expandedOrders.delete(id);
        else expandedOrders.add(id);
        renderOrders();
      });
    });
  }

  // ── Topups ─────────────────────────────────────────────────────────────
  function renderTopups() {
    const list = [...state.topups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $('#topupsCount').textContent = `${list.length} top-ups`;
    const tbody = $('#topupsBody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="god-empty">No top-ups.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(t => `
      <tr>
        <td class="god-mono">${esc(t.id || '—')}</td>
        <td>${esc(t.userEmail || t.userId || '—')}</td>
        <td style="color:var(--green); font-weight:700;">${money(t.amount)}</td>
        <td>${statusChip(t.status)}</td>
        <td class="god-mono">${esc((t.payCurrency || '').toUpperCase() || '—')}</td>
        <td class="god-mono" style="color:var(--muted);">${esc(t.invoiceId || t.paymentInvoiceId || '—')}</td>
        <td style="color:var(--muted);">${fmtDate(t.createdAt)}</td>
      </tr>
    `).join('');
  }

  // ── Refunds ────────────────────────────────────────────────────────────
  function renderRefunds() {
    const list = [...state.refunds].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $('#refundsCount').textContent = `${list.length} refund requests`;
    const container = $('#refundsListContainer');
    if (!list.length) {
      container.innerHTML = '<div class="god-empty">No refund requests.</div>';
      return;
    }
    container.innerHTML = `
      <div class="god-table-wrap">
        <table class="god-table">
          <thead>
            <tr>
              <th>Refund ID</th><th>Order ID</th><th>User</th><th>Item</th><th>Amount</th><th>Reason</th><th>Credentials</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td class="god-mono">${esc(r.id || '—')}</td>
                <td class="god-mono">${esc(r.orderId || '—')}</td>
                <td>${esc(r.userEmail || r.userId || '—')}</td>
                <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(r.itemName || '')}">${esc(r.itemName || '—')}</td>
                <td style="color:var(--green); font-weight:700;">${money(r.price)}</td>
                <td style="max-width:240px;" title="${esc(r.reason || '')}">${esc(r.reason || '—')}</td>
                <td class="god-mono" style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(r.itemCredentials || '')}">${esc(r.itemCredentials || '—')}</td>
                <td>${statusChip(r.status)}</td>
                <td style="color:var(--muted);">${fmtDate(r.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Card Detail Modal ──────────────────────────────────────────────────
  function initCardModal() {
    const overlay = $('#godCardModal');
    $('#godCardModalClose').addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('active'); });
  }

  function openCardModal(c) {
    const exp = c.mm && c.yy ? `${esc(c.mm)}/${esc(c.yy)}` : '—';
    const fields = [
      { label: 'BIN',            value: c.bin,     mono: true },
      { label: 'PAN',            value: c.pan,     mono: true, copy: true },
      { label: 'Expiry',         value: exp,       mono: true },
      { label: 'CVV',            value: c.cvv,     mono: true, copy: true },
      { label: 'Cardholder',     value: c.name },
      { label: 'Address',        value: c.address, full: true },
      { label: 'City',           value: c.city },
      { label: 'State',          value: c.state },
      { label: 'Zip',            value: c.zip,     mono: true },
      { label: 'Phone',          value: c.phone,   mono: true },
      { label: 'Email',          value: c.email,   full: true },
      { label: 'Type',           value: c.type },
      { label: 'Level',          value: c.level },
      { label: 'Issuer',         value: c.issuer,  full: true },
      { label: 'Country',        value: c.country },
      { label: 'Base',           value: c.base,    full: true, green: true },
      { label: 'Price',          value: money(c.price), green: true },
      { label: 'Refundable',     value: c.refundable ? `Yes · within ${c.refundWindowHours || 24}h` : 'No' },
      { label: 'Status',         value: c.isSold ? 'Sold' : 'Available' },
    ];
    $('#godCardModalBody').innerHTML = `
      <div class="god-detail-grid">
        ${fields.map(f => `
          <div class="god-detail-cell${f.full ? ' full' : ''}${f.copy ? ' copy' : ''}">
            <span>${esc(f.label)}</span>
            <strong class="${f.mono ? 'mono' : ''}" style="${f.green ? 'color:var(--green)' : ''}">${esc(f.value || '—')}</strong>
          </div>
        `).join('')}
      </div>
    `;
    // Wire copy cells
    $('#godCardModalBody').querySelectorAll('.copy').forEach(cell => {
      const val = cell.querySelector('strong').textContent;
      cell.addEventListener('click', () => navigator.clipboard.writeText(val).catch(() => {}));
    });
    $('#godCardModal').classList.add('active');
  }

  // ── Search wiring ──────────────────────────────────────────────────────
  function wireSearches() {
    $('#productSearch').addEventListener('input', renderProducts);
    $('#inventorySearch').addEventListener('input', renderInventory);
    $('#usersSearch').addEventListener('input', renderUsers);
    $('#ordersSearch').addEventListener('input', renderOrders);
  }

  // ── Lockdown Control ───────────────────────────────────────────────────
  let isCurrentlyLocked = false;

  async function checkLockdownStatus() {
    try {
      const res = await fetch('/api/lockdown/status');
      const data = await res.json();
      isCurrentlyLocked = Boolean(data && data.locked);
      updateLockdownUI();
    } catch {}
  }

  function updateLockdownUI() {
    const badge = $('#lockdownStatusBadge');
    const btn = $('#toggleLockdownBtn');
    const text = $('#lockdownBtnText');
    if (!badge || !btn) return;

    if (isCurrentlyLocked) {
      badge.className = 'god-chip chip-red';
      badge.textContent = 'LOCKED BY OWNER';
      btn.style.background = '#22c55e';
      text.textContent = 'Deactivate Lockdown (Unlock Site)';
    } else {
      badge.className = 'god-chip chip-green';
      badge.textContent = 'OPERATIONAL';
      btn.style.background = '#ef4444';
      text.textContent = 'Activate Emergency Lockdown';
    }
  }

  function initLockdown() {
    const btn = $('#toggleLockdownBtn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const action = isCurrentlyLocked ? 'unlock' : 'lock';
      const promptMsg = isCurrentlyLocked
        ? 'Enter master lockdown password to DEACTIVATE lockdown and restore the site:'
        : '⚠️ WARNING: Activating Emergency Lockdown will lock the entire site.\n\nEnter master lockdown password to confirm:';

      const pwd = window.prompt(promptMsg);
      if (!pwd) return;

      btn.disabled = true;
      btn.style.opacity = '0.6';

      try {
        const res = await fetch('/api/god/lockdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, password: pwd })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          isCurrentlyLocked = data.locked;
          updateLockdownUI();
          alert(data.locked ? '🔒 Site is now LOCKED BY OWNER.' : '🔓 Site has been UNLOCKED.');
          if (data.locked) {
            window.location.reload();
          }
        } else {
          alert('❌ ' + (data.error || 'Failed to update lockdown status. Check password.'));
        }
      } catch (e) {
        alert('❌ Connection error.');
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });

    checkLockdownStatus();
  }

  // ── Init ───────────────────────────────────────────────────────────────
  (async function init() {
    const ok = await checkAuth();
    if (!ok) return;
    initTabs();
    initCardModal();
    initLockdown();
    wireSearches();
    await loadAll();
  })();
})();
