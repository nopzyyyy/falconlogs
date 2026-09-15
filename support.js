let myTicketsList = [];
let currentActiveTicketId = null;

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initInstructionCheck();
  initOrderLookup();
  initFormSubmit();
  initHistoryFilters();
  initModalClose();
  loadMyTickets();
});

// Tab Switcher
function initTabs() {
  const tabSubmitBtn = document.querySelector("#tabSubmitBtn");
  const tabHistoryBtn = document.querySelector("#tabHistoryBtn");
  const viewSubmitTicket = document.querySelector("#viewSubmitTicket");
  const viewHistory = document.querySelector("#viewHistory");

  if (!tabSubmitBtn || !tabHistoryBtn || !viewSubmitTicket || !viewHistory) return;

  tabSubmitBtn.addEventListener("click", () => {
    tabSubmitBtn.classList.add("active");
    tabHistoryBtn.classList.remove("active");
    viewSubmitTicket.style.display = "block";
    viewHistory.style.display = "none";
  });

  tabHistoryBtn.addEventListener("click", () => {
    tabHistoryBtn.classList.add("active");
    tabSubmitBtn.classList.remove("active");
    viewSubmitTicket.style.display = "none";
    viewHistory.style.display = "block";
    loadMyTickets();
  });
}

// Instruction Checkbox Enforcer
function initInstructionCheck() {
  const check = document.querySelector("#readInstructionsCheck");
  const form = document.querySelector("#createTicketForm");
  if (!check || !form) return;

  check.addEventListener("change", () => {
    if (check.checked) {
      form.style.opacity = "1";
      form.style.pointerEvents = "auto";
    } else {
      form.style.opacity = "0.5";
      form.style.pointerEvents = "none";
    }
  });
}

// Order ID Lookup
function initOrderLookup() {
  const lookupBtn = document.querySelector("#lookupOrderBtn");
  const orderInput = document.querySelector("#ticketOrderIdInput");
  const productSelect = document.querySelector("#ticketProductSelect");
  const statusLabel = document.querySelector("#orderLookupStatus");

  if (!lookupBtn || !orderInput || !productSelect) return;

  lookupBtn.addEventListener("click", async () => {
    const orderId = orderInput.value.trim();
    if (!orderId) {
      if (statusLabel) {
        statusLabel.textContent = "Please enter an Order ID to submit.";
        statusLabel.style.color = "#f87171";
      }
      return;
    }

    lookupBtn.disabled = true;
    lookupBtn.textContent = "Loading...";

    try {
      const res = await fetch(`/api/tickets/lookup-order?orderId=${encodeURIComponent(orderId)}`);
      const data = await res.json();
      
      lookupBtn.disabled = false;
      lookupBtn.textContent = "Submit";

      if (res.ok && data.ok && data.order) {
        const items = data.order.items || [];
        if (items.length === 0) {
          productSelect.innerHTML = `<option value="">No items found in this order</option>`;
          productSelect.disabled = true;
          if (statusLabel) {
            statusLabel.textContent = "No items found in this order.";
            statusLabel.style.color = "#f87171";
          }
          return;
        }

        productSelect.innerHTML = items.map((item, idx) => {
          const nameStr = item.name || "Item";
          const varStr = item.variantName ? ` (${item.variantName})` : "";
          const qtyStr = item.quantity ? ` [Qty: ${item.quantity}]` : "";
          return `<option value="${idx}" data-item-id="${item.id || idx}" data-name="${escapeHtml(nameStr)}" data-variant="${escapeHtml(item.variantName || 'Standard')}">${nameStr}${varStr}${qtyStr}</option>`;
        }).join("");

        productSelect.disabled = false;
        if (statusLabel) {
          statusLabel.textContent = `✓ Order verified! Found ${items.length} product(s).`;
          statusLabel.style.color = "#4ade80";
        }
      } else {
        productSelect.innerHTML = `<option value="">-- Submit Order ID first --</option>`;
        productSelect.disabled = true;
        if (statusLabel) {
          statusLabel.textContent = data.error || "Order not found or does not belong to your account.";
          statusLabel.style.color = "#f87171";
        }
      }
    } catch (e) {
      lookupBtn.disabled = false;
      lookupBtn.textContent = "Submit";
      if (statusLabel) {
        statusLabel.textContent = "Error connecting to server.";
        statusLabel.style.color = "#f87171";
      }
    }
  });
}

// Form Submit
function initFormSubmit() {
  const form = document.querySelector("#createTicketForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const orderId = document.querySelector("#ticketOrderIdInput").value.trim();
    const productSelect = document.querySelector("#ticketProductSelect");
    const selectedOption = productSelect.options[productSelect.selectedIndex];

    if (!orderId || !selectedOption || !selectedOption.value) {
      if (typeof showMysterioAlert === "function") {
        showMysterioAlert({ message: "Please submit a valid Order ID and select a product first.", title: "Missing Order Info", isError: true });
      } else {
        alert("Please submit a valid Order ID and select a product first.");
      }
      return;
    }

    const productName = selectedOption.dataset.name || "Product";
    const variantName = selectedOption.dataset.variant || "Standard";
    const issueReason = document.querySelector("#ticketIssueSelect").value;
    const replacementCount = parseInt(document.querySelector("#ticketCountInput").value, 10) || 1;
    const message = document.querySelector("#ticketMessageInput").value.trim();

    if (!message) {
      if (typeof showMysterioAlert === "function") {
        showMysterioAlert({ message: "Please provide a message explaining your issue.", title: "Missing Details", isError: true });
      } else {
        alert("Please provide a message explaining your issue.");
      }
      return;
    }

    const submitBtn = document.querySelector("#submitTicketBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting Ticket...";

    try {
      const res = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          productName,
          variantName,
          issueReason,
          replacementCount,
          message
        })
      });
      const data = await res.json();

      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Ticket";

      if (res.ok && data.success) {
        if (typeof showMysterioAlert === "function") {
          showMysterioAlert({ message: "Your support ticket has been submitted! Support staff will review it shortly.", title: "Ticket Submitted", isError: false });
        } else {
          alert("Your support ticket has been submitted!");
        }

        form.reset();
        productSelect.innerHTML = `<option value="">-- Submit Order ID first --</option>`;
        productSelect.disabled = true;
        document.querySelector("#orderLookupStatus").textContent = "";

        // Switch to History tab
        document.querySelector("#tabHistoryBtn").click();
      } else {
        if (typeof showMysterioAlert === "function") {
          showMysterioAlert({ message: data.error || "Failed to submit ticket.", title: "Error", isError: true });
        } else {
          alert(data.error || "Failed to submit ticket.");
        }
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Ticket";
      console.error(err);
    }
  });
}

// History Filters & Loading
function initHistoryFilters() {
  const searchInput = document.querySelector("#historySearchInput");
  const statusFilter = document.querySelector("#historyStatusFilter");

  if (searchInput) searchInput.addEventListener("input", renderHistoryTable);
  if (statusFilter) statusFilter.addEventListener("change", renderHistoryTable);
}

async function loadMyTickets() {
  const rows = document.querySelector("#myTicketsRows");
  if (!rows) return;
  rows.innerHTML = `<tr><td colspan="7" class="empty">Loading tickets history...</td></tr>`;

  try {
    const res = await fetch("/api/tickets/my-tickets");
    if (!res.ok) {
      rows.innerHTML = `<tr><td colspan="7" class="empty" style="color:var(--red);">Please log in to view ticket history.</td></tr>`;
      return;
    }
    const data = await res.json();
    myTicketsList = Array.isArray(data.tickets) ? data.tickets : [];
    renderHistoryTable();
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="7" class="empty" style="color:var(--red);">Failed to load tickets.</td></tr>`;
  }
}

function renderHistoryTable() {
  const rows = document.querySelector("#myTicketsRows");
  const query = (document.querySelector("#historySearchInput")?.value || "").toLowerCase().trim();
  const statusVal = document.querySelector("#historyStatusFilter")?.value || "ALL";

  if (!rows) return;

  let filtered = myTicketsList.filter(t => {
    if (statusVal !== "ALL" && (t.status || "PENDING").toUpperCase() !== statusVal) return false;
    if (query) {
      const idMatch = (t.id || "").toLowerCase().includes(query);
      const orderMatch = (t.orderId || "").toLowerCase().includes(query);
      const prodMatch = (t.productName || "").toLowerCase().includes(query);
      if (!idMatch && !orderMatch && !prodMatch) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    rows.innerHTML = `<tr><td colspan="7" class="empty">No tickets found.</td></tr>`;
    return;
  }

  rows.innerHTML = filtered.map(t => {
    const rawSt = (t.status || "PENDING").toUpperCase();
    let displaySt = "Pending";
    let statusStyle = 'color: #f59e0b; font-weight: 600;';

    if (rawSt === "RESOLVED") {
      displaySt = "Resolved";
      statusStyle = 'color: #22c55e; font-weight: 600;';
    } else if (rawSt === "REFUNDED") {
      displaySt = "Refunded";
      statusStyle = 'color: #f97316; font-weight: 600;';
    } else if (rawSt === "DENIED") {
      displaySt = "Denied";
      statusStyle = 'color: #ef4444; font-weight: 600;';
    }

    return `
      <tr>
        <td style="font-weight: 600; color: #ffffff;">${escapeHtml(t.productName || "Product")}</td>
        <td style="color: #cbd5e1;">${escapeHtml(t.variantName || "Standard")}</td>
        <td style="color: #cbd5e1;">${t.replacementCount || 1}</td>
        <td style="color: #94a3b8; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.issueReason || t.message || "—")}</td>
        <td style="${statusStyle}">${displaySt}</td>
        <td style="font-size: 11.5px; color: #94a3b8;">${new Date(t.createdAt || Date.now()).toLocaleString()}</td>
        <td style="text-align: right;">
          <button type="button" class="history-dispute-btn" onclick="window.viewTicketDetails('${t.id}')">dispute</button>
        </td>
      </tr>
    `;
  }).join("");
}

// View Ticket Details Modal
window.viewTicketDetails = function(ticketId) {
  const ticket = myTicketsList.find(t => t.id === ticketId);
  if (!ticket) return;

  currentActiveTicketId = ticketId;
  const modal = document.querySelector("#ticketDetailsModal");
  const title = document.querySelector("#modalTicketTitle");
  const meta = document.querySelector("#modalTicketMeta");
  const replaceBox = document.querySelector("#modalReplacementBox");
  const replaceText = document.querySelector("#modalReplacementStockText");
  const refundBox = document.querySelector("#modalRefundBox");
  const refundText = document.querySelector("#modalRefundText");
  const chatMessages = document.querySelector("#modalChatMessages");

  if (!modal) return;

  if (title) title.textContent = `Ticket ${ticket.id} (${ticket.status})`;

  if (meta) {
    meta.innerHTML = `
      <div><strong>Order ID:</strong> <code style="color:#fdba74;">${escapeHtml(ticket.orderId)}</code></div>
      <div><strong>Product:</strong> ${escapeHtml(ticket.productName)} — ${escapeHtml(ticket.variantName || "Standard")} (x${ticket.replacementCount || 1})</div>
      <div><strong>Issue:</strong> ${escapeHtml(ticket.issueReason)}</div>
      <div><strong>Submitted:</strong> ${new Date(ticket.createdAt).toLocaleString()}</div>
    `;
  }

  // Display replacement stock box if replacement delivered
  if (ticket.replacementCredentials) {
    if (replaceBox) replaceBox.style.display = "block";
    if (replaceText) replaceText.value = ticket.replacementCredentials;
  } else {
    if (replaceBox) replaceBox.style.display = "none";
  }

  // Display refund box if refunded
  if (ticket.refundAmount && ticket.refundAmount > 0) {
    if (refundBox) refundBox.style.display = "block";
    if (refundText) refundText.textContent = `£${Number(ticket.refundAmount).toFixed(2)} refunded to your balance.`;
  } else {
    if (refundBox) refundBox.style.display = "none";
  }

  // Render Chat Messages
  renderModalMessages(ticket.messages || []);

  modal.classList.add("active");
};

function renderModalMessages(msgs) {
  const chatMessages = document.querySelector("#modalChatMessages");
  if (!chatMessages) return;

  if (!msgs || msgs.length === 0) {
    chatMessages.innerHTML = `<div style="font-size:12px; color:var(--muted); text-align:center;">No messages in thread yet.</div>`;
    return;
  }

  chatMessages.innerHTML = msgs.map(m => {
    const isStaff = m.senderRole === "REPLACE_ADMIN" || m.senderRole === "ADMIN" || m.senderRole === "STAFF";
    const bg = isStaff ? "rgba(234, 88, 12, 0.15)" : "rgba(255, 255, 255, 0.05)";
    const border = isStaff ? "1px solid rgba(234, 88, 12, 0.3)" : "1px solid rgba(255, 255, 255, 0.1)";
    const senderName = isStaff ? "Staff Support" : "You";

    return `
      <div style="background: ${bg}; border: ${border}; border-radius: 8px; padding: 10px 14px;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; font-weight: 700; color: ${isStaff ? "#fb923c" : "#e2e8f0"};">
          <span>${senderName}</span>
          <span style="opacity: 0.6; font-weight: 400;">${new Date(m.createdAt || Date.now()).toLocaleTimeString()}</span>
        </div>
        <div style="font-size: 12.5px; color: #fff; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(m.message || m.text || "")}</div>
      </div>
    `;
  }).join("");

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// User Reply Form Submit
document.querySelector("#userReplyForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.querySelector("#userReplyInput");
  const msg = input ? input.value.trim() : "";
  if (!msg || !currentActiveTicketId) return;

  input.value = "";
  try {
    const res = await fetch(`/api/replacements/${encodeURIComponent(currentActiveTicketId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    if (res.ok && data.messages) {
      renderModalMessages(data.messages);
      const t = myTicketsList.find(t => t.id === currentActiveTicketId);
      if (t) t.messages = data.messages;
    }
  } catch (err) {
    console.error(err);
  }
});

function initModalClose() {
  document.querySelector("#closeTicketDetailsModal")?.addEventListener("click", () => {
    document.querySelector("#ticketDetailsModal")?.classList.remove("active");
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
