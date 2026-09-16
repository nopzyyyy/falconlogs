(() => {
  let selectedAmount = 0;
  let selectedTopupMethod = "crypto";
  const TOPUP_BONUS = 0.10;

  function money(v) { return Number(v || 0).toFixed(2); }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[c]);
  }

  const balanceAmount   = document.getElementById("balanceAmount");
  const balanceSuccess  = document.getElementById("balanceSuccess");
  const balanceStatusPill = document.getElementById("balanceStatusPill");
  const customAmount    = document.getElementById("customAmount");
  const payNowBtn       = document.getElementById("payNowBtn");
  const topupStatus     = document.getElementById("topupStatus");
  const txnRows         = document.getElementById("txnRows");
  const refreshTxnBtn   = document.getElementById("refreshTxnBtn");
  const receiveRow      = document.getElementById("topupReceiveRow");
  const receiveAmt      = document.getElementById("topupReceiveAmt");
  const quickButtons    = document.querySelectorAll("#quickAmounts button");
  const cryptoMethodLabel = document.getElementById("topupMethodCryptoLabel");
  const chimeMethodLabel = document.getElementById("topupMethodChimeLabel");
  const topupMethodInputs = document.querySelectorAll("input[name='topupMethod']");

  function updateUI() {
    const has = selectedAmount >= 1;
    const bonusPct = selectedTopupMethod === "crypto" ? TOPUP_BONUS : 0;
    
    if (receiveRow) receiveRow.hidden = !has;
    if (receiveAmt) receiveAmt.textContent = `$${money(selectedAmount * (1 + bonusPct))}`;
    
    if (receiveRow && has) {
      if (selectedTopupMethod === "crypto") {
        receiveRow.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> You'll receive <strong id="topupReceiveAmt">$${money(selectedAmount * (1 + TOPUP_BONUS))}</strong> in store credits (+10% bonus)`;
      } else {
        receiveRow.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> You'll receive <strong id="topupReceiveAmt">$${money(selectedAmount)}</strong> in store credits (no bonus)`;
      }
    }
    
    if (!payNowBtn) return;
    if (has) {
      payNowBtn.disabled = false;
      if (selectedTopupMethod === "chime") {
        payNowBtn.innerHTML = `
          <span>Initiate Chime Topup</span> &mdash; <strong>$${money(selectedAmount)}</strong>
        `;
        payNowBtn.classList.remove("chime-btn");
      } else {
        payNowBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; display:inline-block; vertical-align:middle;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8l-2 4h12l-2-4z"/></svg>
          <span>Create Invoice</span> &mdash; <strong>$${money(selectedAmount)}</strong>
        `;
        payNowBtn.classList.remove("chime-btn");
      }
      payNowBtn.style.opacity = "1";
    } else {
      payNowBtn.disabled = true;
      payNowBtn.innerHTML = `Select an amount above`;
      payNowBtn.classList.remove("chime-btn");
      payNowBtn.style.opacity = "0.45";
    }
  }

  if (topupMethodInputs.length > 0) {
    topupMethodInputs.forEach(input => {
      input.addEventListener("change", () => {
        selectedTopupMethod = input.value;
        if (selectedTopupMethod === "crypto") {
          cryptoMethodLabel.classList.add("selected");
          cryptoMethodLabel.style.borderColor = "#d946ef";
          chimeMethodLabel.classList.remove("selected");
          chimeMethodLabel.style.borderColor = "var(--line)";
        } else {
          chimeMethodLabel.classList.add("selected");
          chimeMethodLabel.style.borderColor = "#d946ef";
          cryptoMethodLabel.classList.remove("selected");
          cryptoMethodLabel.style.borderColor = "var(--line)";
        }
        updateUI();
      });
    });
  }

  quickButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      quickButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedAmount = Number(btn.dataset.amount);
      if (customAmount) customAmount.value = "";
      updateUI();
    });
  });

  if (customAmount) {
    customAmount.addEventListener("input", () => {
      quickButtons.forEach(b => b.classList.remove("active"));
      selectedAmount = Math.max(0, Number(customAmount.value) || 0);
      updateUI();
    });
  }

  if (payNowBtn) {
    payNowBtn.addEventListener("click", async () => {
      if (selectedAmount < 1) return;
      payNowBtn.disabled = true;
      payNowBtn.innerHTML = `<span class="spinner-sm"></span> Generating invoice...`;
      payNowBtn.style.opacity = "0.7";
      if (topupStatus) topupStatus.hidden = true;

      try {
        const res = await fetch("/api/topups/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: selectedAmount, paymentMethod: selectedTopupMethod.toUpperCase() })
        });
        const data = await res.json();
        if (!res.ok) {
          showStatus(data.error || "Failed to create invoice.", "error");
          updateUI();
          return;
        }
        if (selectedTopupMethod === "chime") {
          showChimeTopupOverlay(data.topup);
        } else {
          showInvoiceOverlay(data.invoiceUrl);
          window.open(data.invoiceUrl, "_blank", "noopener");
        }
        updateUI();
        loadTransactions();
      } catch {
        showStatus("Network error. Please try again.", "error");
        updateUI();
      }
    });
  }

  let overlayPoller = null;
  function showInvoiceOverlay(url) {
    let overlay = document.getElementById("invoiceOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "invoiceOverlay";
      overlay.style.cssText = "position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.9); padding:20px;";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="max-width:420px; width:100%; background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:32px 26px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <div style="width:42px; height:42px; border:3px solid var(--line); border-top-color:var(--green); border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 18px;"></div>
        <h2 style="font-size:18px; font-weight:800; color:var(--text); margin:0 0 8px;">Invoice Ready</h2>
        <p style="font-size:13px; color:var(--muted); margin:0 0 22px; line-height:1.5;">Your payment page should have opened in a new tab. If it didn't, tap the button below.</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="topup-pay-btn" style="display:flex; align-items:center; justify-content:center; gap:10px; text-decoration:none; margin:0 0 12px; opacity:1;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open Payment Page
        </a>
        <button type="button" id="invoiceOverlayClose" style="width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; background:transparent; color:var(--muted); font-size:13px; font-weight:600; cursor:pointer;">Done / Close</button>
      </div>
    `;
    overlay.style.display = "flex";

    // Keep the wallet + transactions refreshing while the overlay is open
    if (overlayPoller) clearInterval(overlayPoller);
    overlayPoller = setInterval(() => { loadBalance(); loadTransactions(); }, 6000);

    const closeBtn = document.getElementById("invoiceOverlayClose");
    if (closeBtn) closeBtn.addEventListener("click", () => {
      overlay.style.display = "none";
      if (overlayPoller) { clearInterval(overlayPoller); overlayPoller = null; }
      loadBalance();
      loadTransactions();
    });
  }

  function showChimeTopupOverlay(topup) {
    let overlay = document.getElementById("invoiceOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "invoiceOverlay";
      overlay.style.cssText = "position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.9); padding:20px;";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="max-width:420px; width:100%; background:var(--panel); border:1px solid var(--line); border-top:4px solid var(--green); border-radius:16px; padding:32px 26px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <div style="width:42px; height:42px; background: var(--green-soft); color: var(--green); border: 1px solid rgba(255, 42, 133, 0.3); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 18px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12" y2="8.01"/>
          </svg>
        </div>
        <h2 style="font-size:18px; font-weight:800; color:var(--text); margin:0 0 8px;">Chime Topup Pending</h2>
        <p style="font-size:13px; color:var(--muted); margin:0 0 22px; line-height:1.5;">Please send the payment using the Chime instructions below to load credits.</p>
        
        <div class="invoice-meta" style="margin-bottom: 22px; text-align: left; background: var(--bg-deep); border: 1px solid var(--line); border-radius: 10px; padding: 14px;">
          <div class="invoice-meta-row" style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px;">
            <span style="color:var(--muted); margin-right:10px;">Chime Sign</span>
            <strong class="mono" style="color:var(--text); display:flex; align-items:center; gap:6px;">
              <span>$km0927</span>
              <button onclick="navigator.clipboard.writeText('$km0927'); this.textContent='Copied!'; setTimeout(()=>this.textContent='Copy', 1000);" style="padding:1px 4px; font-size:10px; background:transparent; border:1px solid var(--line); border-radius:3px; color:var(--muted); cursor:pointer;">Copy</button>
            </strong>
          </div>
          <div class="invoice-meta-row" style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px;">
            <span style="color:var(--muted); margin-right:10px;">Amount</span>
            <strong style="color:var(--green);">£${Number(topup.amount).toFixed(2)}</strong>
          </div>
          <div class="invoice-meta-row" style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px;">
            <span style="color:var(--muted); margin-right:10px;">Status</span>
            <strong class="invoice-pending-pill" style="color:var(--amber); display:flex; align-items:center; gap:5px; background: rgba(245, 158, 11, 0.1); border-radius: 4px; padding: 2px 6px;">
              <span class="pulse-dot" style="display:inline-block; width:6px; height:6px; background:var(--amber); border-radius:50%;"></span> Awaiting Transfer
            </strong>
          </div>
          <div class="invoice-meta-row" style="display:flex; justify-content:space-between; font-size:13px;">
            <span style="color:var(--muted); margin-right:10px;">Expires In</span>
            <strong id="chimeCountdown" style="color:var(--red); font-variant-numeric: tabular-nums;">10:00</strong>
          </div>
        </div>

        <button type="button" id="invoiceOverlayClose" style="width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--green); color:#03200f; font-size:13px; font-weight:700; cursor:pointer; margin-top: 10px;">Done / Close</button>
      </div>
    `;
    overlay.style.display = "flex";

    if (overlayPoller) clearInterval(overlayPoller);
    overlayPoller = setInterval(() => { loadBalance(); loadTransactions(); }, 6000);

    const closeBtn = document.getElementById("invoiceOverlayClose");
    if (closeBtn) closeBtn.addEventListener("click", () => {
      overlay.style.display = "none";
      if (overlayPoller) { clearInterval(overlayPoller); overlayPoller = null; }
      loadBalance();
      loadTransactions();
    });

    // Start 10-minute real-time countdown timer
    const startTime = new Date(topup.createdAt).getTime();
    const endTime = startTime + 10 * 60 * 1000;
    
    const chimeTimer = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      const min = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000);
      const countdownEl = document.getElementById("chimeCountdown");
      if (!countdownEl) {
        clearInterval(chimeTimer);
        return;
      }
      countdownEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      
      if (remaining <= 0) {
        clearInterval(chimeTimer);
        const statusPill = overlay.querySelector(".invoice-pending-pill");
        if (statusPill) {
          statusPill.style.background = "rgba(239, 68, 68, 0.1)";
          statusPill.style.color = "var(--red)";
          statusPill.innerHTML = "Expired";
        }
        countdownEl.style.color = "var(--muted)";
        countdownEl.textContent = "Expired";
        if (overlayPoller) { clearInterval(overlayPoller); overlayPoller = null; }
      }
    }, 1000);
  }

  function showStatus(msg, type) {
    if (!topupStatus) return;
    topupStatus.textContent = msg;
    topupStatus.className = `topup-status ${type}`;
    topupStatus.hidden = false;
  }

  async function loadBalance() {
    try {
      const r = await fetch("/api/auth/me");
      const d = await r.json();
      if (d.authenticated && balanceAmount) balanceAmount.textContent = `$${money(d.balance)}`;
    } catch {}
  }

  function statusBadge(status) {
    const map = {
      COMPLETED:       { label: "Completed", cls: "status-ok" },
      WAITING_PAYMENT: { label: "Waiting",   cls: "status-pending" },
      FAILED:          { label: "Failed",    cls: "status-bad" },
      EXPIRED:         { label: "Expired",   cls: "status-bad" }
    };
    const info = map[status] || { label: status || "—", cls: "status-pending" };
    return `<span class="txn-status-badge ${info.cls}">${escapeHtml(info.label)}</span>`;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function loadTransactions() {
    if (!txnRows) return;
    try {
      const r = await fetch("/api/topups");
      const d = await r.json();
      const tx = d.topups || [];
      let hasPending = false;
      if (tx.length === 0) {
        txnRows.innerHTML = `<tr><td colspan="5" class="empty">No transactions yet.</td></tr>`;
        if (balanceStatusPill) balanceStatusPill.hidden = true;
        return;
      }
      txnRows.innerHTML = tx.map(t => {
        if (t.status === "WAITING_PAYMENT") hasPending = true;
        return `<tr>
          <td class="mono">${escapeHtml(t.id)}</td>
          <td>${fmtDate(t.createdAt)}</td>
          <td class="amount">$${money(t.amount)}</td>
          <td>${statusBadge(t.status)}</td>
          <td>${t.status === "WAITING_PAYMENT" && t.invoiceUrl
            ? `<a class="pay-link" href="${escapeHtml(t.invoiceUrl)}" target="_blank" rel="noopener">Pay</a>`
            : "—"}</td>
        </tr>`;
      }).join("");
      if (balanceStatusPill) balanceStatusPill.hidden = !hasPending;
    } catch {
      if (txnRows) txnRows.innerHTML = `<tr><td colspan="5" class="empty">Could not load transactions.</td></tr>`;
    }
  }

  if (refreshTxnBtn) {
    refreshTxnBtn.addEventListener("click", () => { loadBalance(); loadTransactions(); });
  }

  if (new URLSearchParams(location.search).get("success") === "true") {
    if (balanceSuccess) balanceSuccess.hidden = false;
    let attempts = 0;
    const poller = setInterval(() => {
      attempts++;
      loadBalance();
      loadTransactions();
      if (attempts >= 12) clearInterval(poller);
    }, 5000);
  }

  // Load settings to hide disabled top-up methods
  fetch("/api/settings")
    .then(r => r.json())
    .then(settings => {
      const methods = settings.paymentMethods || {};
      
      const applyDisabledState = (label, input, disabled) => {
        if (!label) return;
        if (disabled) {
          label.classList.add("disabled");
          label.style.opacity = "0.45";
          label.style.pointerEvents = "none";
          if (input) input.disabled = true;
          
          let overlay = label.querySelector(".payment-option-disabled-overlay");
          if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "payment-option-disabled-overlay";
            overlay.textContent = "Unavailable";
            overlay.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; color: #ff2a85; font-size: 10.5px; font-weight: 800; text-transform: uppercase; border-radius: 7px; box-sizing: border-box; border: 1px solid rgba(255, 42, 133, 0.4); z-index: 10;";
            label.appendChild(overlay);
          }
        } else {
          label.classList.remove("disabled");
          label.style.opacity = "";
          label.style.pointerEvents = "";
          if (input) input.disabled = false;
          const overlay = label.querySelector(".payment-option-disabled-overlay");
          if (overlay) overlay.remove();
        }
      };

      const cryptoInput = Array.from(topupMethodInputs).find(input => input.value === "crypto");
      const chimeInput = Array.from(topupMethodInputs).find(input => input.value === "chime");

      applyDisabledState(cryptoMethodLabel, cryptoInput, methods.crypto === false);
      applyDisabledState(chimeMethodLabel, chimeInput, methods.chime === false);
      
      const visibleLabels = [
        { label: cryptoMethodLabel, val: "crypto" },
        { label: chimeMethodLabel, val: "chime" }
      ].filter(x => x.label && !x.label.classList.contains("disabled"));
      
      if (visibleLabels.length > 0) {
        const currentChecked = Array.from(topupMethodInputs).find(input => input.checked);
        if (!currentChecked || currentChecked.closest(".payment-option").classList.contains("disabled")) {
          const firstActive = visibleLabels[0];
          selectedTopupMethod = firstActive.val;
          
          topupMethodInputs.forEach(input => {
            if (input.value === firstActive.val) {
              input.checked = true;
              firstActive.label.classList.add("selected");
              firstActive.label.style.borderColor = "#d946ef";
            } else {
              input.checked = false;
              const lbl = input.closest(".payment-option");
              if (lbl) {
                lbl.classList.remove("selected");
                lbl.style.borderColor = "var(--line)";
              }
            }
          });
        }
      }
      updateUI();
    }).catch(err => console.error("Error loading topup settings:", err));

  updateUI();
  loadBalance();
  loadTransactions();
})();
