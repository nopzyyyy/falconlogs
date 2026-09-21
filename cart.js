// Falcon Logs Cart Logic - 1:1 Matching Mockup
let cart = [];
let selectedPaymentMethod = "BALANCE"; // Default to BALANCE
let appliedCoupon = null;
let currentUser = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function getCurrencySign() {
  const meta = document.querySelector('meta[name="currency-sign"]');
  return meta ? meta.content : '£';
}

function formatVariantName(name) {
  if (!name) return "";
  let varName = String(name).trim();
  varName = varName.replace(/(\d+(?:\.\d+)?)\s*\$/g, "£$1")
                   .replace(/\$\s*(\d+(?:\.\d+)?)/g, "£$1")
                   .replace(/(\d+(?:\.\d+)?)\s*£/g, "£$1");
  return varName;
}

function loadCart() {
  if (typeof window.getCart === "function") {
    cart = window.getCart();
  } else {
    try {
      const expiresAt = Number(localStorage.getItem("falcon_cart_expires_at") || 0);
      if (expiresAt && Date.now() > expiresAt) {
        localStorage.removeItem("falcon_cart");
        localStorage.removeItem("falcon_cart_expires_at");
        cart = [];
      } else {
        cart = JSON.parse(localStorage.getItem("falcon_cart") || "[]");
      }
    } catch (e) {
      cart = [];
    }
  }
}

function saveCart() {
  if (typeof window.setCart === "function") {
    window.setCart(cart);
  } else {
    if (!cart || cart.length === 0) {
      localStorage.removeItem("falcon_cart");
      localStorage.removeItem("falcon_cart_expires_at");
    } else {
      localStorage.setItem("falcon_cart", JSON.stringify(cart));
      localStorage.setItem("falcon_cart_expires_at", String(Date.now() + 15 * 60 * 1000));
    }
    if (typeof window.updateCartBadge === "function") window.updateCartBadge();
  }
}

window.addEventListener("cart:expired", () => {
  cart = [];
  renderCart();
});

async function checkAuth() {
  try {
    const r = await fetch('/api/auth/me');
    if (r.ok) {
      const data = await r.json();
      if (data && (data.authenticated === true || data.user)) {
        currentUser = data.user || data;
        const guestActions = document.getElementById('navGuestActions');
        const authActions = document.getElementById('navAuthActions');
        if (guestActions) guestActions.style.setProperty('display', 'none', 'important');
        if (authActions) authActions.style.setProperty('display', 'flex', 'important');
        const balEl = document.getElementById('clientBalance');
        if (balEl) balEl.textContent = `£${Number(currentUser.balance || 0).toFixed(2)}`;
        const acctName = document.getElementById('accountUsername');
        if (acctName) acctName.textContent = currentUser.email ? currentUser.email.split('@')[0] : (currentUser.name || 'user');
        return currentUser;
      }
    }
  } catch (_) {}
  currentUser = null;
  return null;
}

async function syncCartWithLiveProducts() {
  if (!cart || cart.length === 0) return;
  try {
    const res = await fetch("/api/products");
    if (!res.ok) return;
    const products = await res.json();
    if (!Array.isArray(products)) return;

    let modified = false;
    cart.forEach(item => {
      const product = products.find(p => p.id === item.productId || p.id === String(item.id).split(":")[0]);
      if (product) {
        if (product.title && item.name !== product.title) {
          item.name = product.title;
          modified = true;
        }
        if (product.image && item.image !== product.image) {
          item.image = product.image;
          modified = true;
        }

        if (Array.isArray(product.variants) && product.variants.length > 0) {
          let variant = product.variants.find(v => v.id === item.variantId || v.id === String(item.id).split(":")[1]);
          if (!variant && item.variantName) {
            variant = product.variants.find(v => String(v.name).toLowerCase().trim() === String(item.variantName).toLowerCase().trim());
          }
          if (variant) {
            item.variantId = variant.id;
            const formattedLiveVarName = formatVariantName(variant.name);
            if (item.variantName !== formattedLiveVarName) {
              item.variantName = formattedLiveVarName;
              modified = true;
            }
            const livePrice = Number(variant.price);
            if (!isNaN(livePrice) && item.price !== livePrice) {
              item.price = livePrice;
              modified = true;
            }
          }
        }
      }
    });

    if (modified) {
      saveCart();
      renderCart();
    }
  } catch (e) {
    console.error("Cart sync error:", e);
  }
}

function renderCart() {
  const itemsList = document.querySelector("#cartItemsList");
  const summarySubtotal = document.querySelector("#summarySubtotal");
  const summaryDiscount = document.querySelector("#summaryDiscount");
  const summaryTotal = document.querySelector("#summaryTotal");
  const purchaseBtn = document.querySelector("#purchaseBtn");
  const cur = getCurrencySign();

  if (!itemsList) return;

  if (!cart || cart.length === 0) {
    itemsList.innerHTML = `
      <div class="cart-empty-state">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg>
        <div style="font-size: 15px; font-weight: 600; color: #ffffff;">Your shopping cart is currently empty.</div>
        <a href="/" class="cart-empty-btn">Browse Products &rarr;</a>
      </div>
    `;
    if (summarySubtotal) summarySubtotal.textContent = `${cur}0.00`;
    if (summaryDiscount) summaryDiscount.textContent = `-${cur}0.00`;
    if (summaryTotal) summaryTotal.textContent = `${cur}0.00`;
    if (purchaseBtn) purchaseBtn.disabled = true;
    return;
  }

  if (purchaseBtn) purchaseBtn.disabled = false;

  itemsList.innerHTML = cart.map((item, idx) => {
    const itemTotal = (item.price || 0) * (item.quantity || 1);
    const formattedVarName = formatVariantName(item.variantName || "Standard");
    const thumbUrl = item.image || "/uploads/discord_thumbnail.png";
    return `
      <div class="cart-product-card" data-index="${idx}">
        <div class="cart-card-top">
          <div class="cart-card-thumb-wrap">
            <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(item.name)}" class="cart-card-thumb" onerror="this.src='/uploads/discord_thumbnail.png'">
          </div>
          <div class="cart-card-info">
            <h4 class="cart-card-title">${escapeHtml(item.name)}</h4>
            <div class="cart-card-variant">${escapeHtml(formattedVarName)}</div>
          </div>
          <button type="button" class="cart-trash-btn" data-index="${idx}" aria-label="Remove item" title="Remove item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
        <div class="cart-card-bottom">
          <span class="cart-meta-label">Price :</span> <span class="cart-meta-value">${cur}${Number(item.price || 0).toFixed(2)}</span>
          <span class="cart-meta-label" style="margin-left: 20px;">QTY :</span> <span class="cart-meta-value">${item.quantity || 1}</span>
          <span class="cart-meta-divider">|</span>
          <span class="cart-meta-label">Total :</span> <span class="cart-meta-value">${cur}${itemTotal.toFixed(2)}</span>
        </div>
      </div>
    `;
  }).join("");

  // Remove item listener
  itemsList.querySelectorAll(".cart-trash-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      cart.splice(idx, 1);
      saveCart();
      renderCart();
    });
  });

  // Calculate Subtotal & Total
  const subtotal = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === "PERCENT") {
      discount = (subtotal * (appliedCoupon.discountValue || 0)) / 100;
    } else {
      discount = Math.min(appliedCoupon.discountValue || 0, subtotal);
    }
  }

  const finalTotal = Math.max(0, subtotal - discount);

  if (summarySubtotal) summarySubtotal.textContent = `${cur}${subtotal.toFixed(2)}`;
  if (summaryDiscount) summaryDiscount.textContent = discount > 0 ? `-${cur}${discount.toFixed(2)}` : `-${cur}0.00`;
  if (summaryTotal) summaryTotal.textContent = `${cur}${finalTotal.toFixed(2)}`;
}

// Payment method selection listeners
function setupPaymentSelection() {
  const choiceCrypto = document.getElementById("choiceCrypto");
  const choiceBalance = document.getElementById("choiceBalance");

  if (choiceCrypto) {
    choiceCrypto.addEventListener("click", () => {
      selectedPaymentMethod = "CRYPTO";
      choiceCrypto.classList.add("selected");
      if (choiceBalance) choiceBalance.classList.remove("selected");
    });
  }

  if (choiceBalance) {
    choiceBalance.addEventListener("click", () => {
      selectedPaymentMethod = "BALANCE";
      choiceBalance.classList.add("selected");
      if (choiceCrypto) choiceCrypto.classList.remove("selected");
    });
  }
}

// Coupon validation
function setupCoupon() {
  const applyCouponBtn = document.getElementById("applyCouponBtn");
  const couponCodeInput = document.getElementById("couponCodeInput");
  const couponMsg = document.getElementById("couponStatusMessage");

  if (applyCouponBtn && couponCodeInput) {
    applyCouponBtn.addEventListener("click", async () => {
      const code = couponCodeInput.value.trim().toUpperCase();
      if (!code) return;

      const subtotal = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
      applyCouponBtn.disabled = true;
      applyCouponBtn.textContent = "...";

      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, total: subtotal })
        });
        const data = await res.json();
        applyCouponBtn.disabled = false;
        applyCouponBtn.textContent = "APPLY";

        if (res.ok && data.valid) {
          appliedCoupon = {
            code: data.code,
            discountType: data.discountType,
            discountValue: data.discountValue,
            discountAmount: data.discountAmount
          };
          const discLabel = data.discountType === "PERCENT" ? `${data.discountValue}% OFF` : `£${Number(data.discountValue).toFixed(2)} OFF`;
          if (couponMsg) {
            couponMsg.textContent = `✓ Coupon "${data.code}" applied (${discLabel})`;
            couponMsg.style.color = "#4ade80";
            couponMsg.style.display = "block";
          }
          renderCart();
        } else {
          appliedCoupon = null;
          if (couponMsg) {
            couponMsg.textContent = data.error || "Invalid or expired coupon code.";
            couponMsg.style.color = "#ef4444";
            couponMsg.style.display = "block";
          }
          renderCart();
        }
      } catch (e) {
        applyCouponBtn.disabled = false;
        applyCouponBtn.textContent = "APPLY";
        if (couponMsg) {
          couponMsg.textContent = "Error verifying coupon code.";
          couponMsg.style.color = "#ef4444";
          couponMsg.style.display = "block";
        }
      }
    });
  }
}

// Purchase / Checkout action
function setupPurchase() {
  const purchaseBtn = document.getElementById("purchaseBtn");
  if (!purchaseBtn) return;

  purchaseBtn.addEventListener("click", async () => {
    const showAlert = window.showFalconAlert;
    if (!cart || cart.length === 0) {
      if (typeof showAlert === "function") {
        showAlert({ message: "Your cart is empty.", title: "Cart Empty", isError: true });
      } else {
        alert("Your cart is empty.");
      }
      return;
    }

    if (!currentUser) {
      if (typeof showAlert === "function") {
        showAlert({ message: "Please log in to complete your purchase.", title: "Login Required", isError: true });
      } else {
        alert("Please log in to complete your purchase.");
      }
      setTimeout(() => window.location.href = "/login.html?redirect=/cart.html", 1200);
      return;
    }

    purchaseBtn.disabled = true;
    const origText = purchaseBtn.textContent;
    purchaseBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Processing...`;

    try {
      const payload = {
        items: cart,
        paymentMethod: selectedPaymentMethod,
        coin: "btc",
        couponCode: appliedCoupon ? appliedCoupon.code : null
      };

      const res = await fetch("/api/orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        data = { error: `Server error (${res.status}). Please try again.` };
      }

      if (res.ok && data.success) {
        // Clear cart
        cart = [];
        saveCart();

        if (data.nowpayments && data.nowpayments.payment_id) {
          try {
            sessionStorage.setItem("active_crypto_payment", JSON.stringify({
              ...data.nowpayments,
              order_id: data.order ? data.order.id : (data.orderId || data.nowpayments.payment_id)
            }));
          } catch (_) {}
          window.location.href = `/pay.html?paymentId=${data.nowpayments.payment_id}`;
        } else if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else if (data.orderId || (data.order && data.order.id)) {
          const ordId = data.orderId || data.order.id;
          window.location.href = `/orders.html?orderId=${ordId}`;
        } else {
          window.location.href = "/orders.html";
        }
      } else {
        if (res.status === 401) {
          if (typeof showAlert === "function") {
            showAlert({ title: "Login Required", message: "Please sign in to complete your purchase.", isError: true });
          } else {
            alert("Please sign in to complete your purchase.");
          }
          setTimeout(() => window.location.href = "/login.html", 1200);
          return;
        }

        const errMsg = data.error || data.message || "Failed to process purchase.";
        if (typeof showAlert === "function") {
          showAlert({ title: "Checkout Error", message: errMsg, isError: true });
        } else {
          alert(errMsg);
        }
      }
    } catch (e) {
      if (typeof showAlert === "function") {
        showAlert({ message: e.message || "Network error during checkout.", title: "Checkout Error", isError: true });
      } else {
        alert(e.message || "Network error during checkout.");
      }
    } finally {
      purchaseBtn.disabled = false;
      purchaseBtn.textContent = origText;
    }
  });
}

function setupLogout() {
  const logoutBtn = document.getElementById("navLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
      window.location.href = '/login.html';
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  loadCart();
  await checkAuth();
  renderCart();
  syncCartWithLiveProducts();
  setupPaymentSelection();
  setupCoupon();
  setupPurchase();
  setupLogout();
  if (typeof window.updateCartBadge === "function") window.updateCartBadge();
});
