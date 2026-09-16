let cart = [];
let selectedPaymentMethod = "balance";
let selectedCoin = "btc";
let selectedNetwork = null;
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

function formatVariantName(name) {
  if (!name) return "";
  let varName = String(name).trim();
  varName = varName.replace(/(\d+(?:\.\d+)?)\s*\$/g, "£$1")
                   .replace(/\$\s*(\d+(?:\.\d+)?)/g, "£$1")
                   .replace(/(\d+(?:\.\d+)?)\s*£/g, "£$1");
  return varName;
}

function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem("mysterio_cart") || "[]");
  } catch (e) {
    cart = [];
  }
}

function saveCart() {
  localStorage.setItem("mysterio_cart", JSON.stringify(cart));
  if (typeof window.updateCartBadge === "function") window.updateCartBadge();
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
      // Find matching product by ID
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

        // Find matching variant
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
      } else {
        if (item.variantName) {
          const formatted = formatVariantName(item.variantName);
          if (item.variantName !== formatted) {
            item.variantName = formatted;
            modified = true;
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

async function fetchUserStatus() {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    const balanceDescLabel = document.querySelector("#balanceDescLabel");
    if (data && data.authenticated) {
      currentUser = data;
      if (balanceDescLabel) {
        balanceDescLabel.textContent = `Available balance: £${Number(data.balance || 0).toFixed(2)}`;
      }
    } else {
      currentUser = null;
    }
  } catch (e) {
    currentUser = null;
  }
  updateCheckoutButtonText();
}

function renderCart() {
  const itemsList = document.querySelector("#cartItemsList");
  const itemCountLabel = document.querySelector("#cartItemCountLabel");
  const summarySubtotal = document.querySelector("#summarySubtotal");
  const summaryDiscount = document.querySelector("#summaryDiscount");
  const summaryTotal = document.querySelector("#summaryTotal");

  if (!itemsList) return;

  const totalItems = cart.reduce((s, i) => s + (i.quantity || 1), 0);
  if (itemCountLabel) {
    itemCountLabel.textContent = `${totalItems} item${totalItems === 1 ? "" : "s"}`;
  }

  if (cart.length === 0) {
    itemsList.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--muted); font-weight:600;">Your cart is empty. <a href="/" style="color:var(--accent-light); text-decoration:none;">Browse Products</a></div>`;
    if (summarySubtotal) summarySubtotal.textContent = "£0.00";
    if (summaryDiscount) summaryDiscount.textContent = "£0.00";
    if (summaryTotal) summaryTotal.textContent = "£0.00";
    return;
  }

  itemsList.innerHTML = cart.map((item, idx) => {
    const itemTotal = (item.price || 0) * (item.quantity || 1);
    const formattedVarName = formatVariantName(item.variantName || "Standard");
    return `
      <div class="cart-item-card">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="cart-item-thumb">` : `<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:16px;">${escapeHtml(String(item.name).slice(0, 2).toUpperCase())}</div>`}
        <div class="cart-item-details">
          <span class="cart-item-name">${escapeHtml(item.name)}</span>
          <div class="cart-item-variant">${escapeHtml(formattedVarName)}</div>
          <div class="cart-item-price-qty">
            Price : <strong class="cart-item-val">£${Number(item.price).toFixed(2)}</strong> &nbsp;&middot;&nbsp; QTY : <strong class="cart-item-val">${item.quantity || 1}</strong>
          </div>
          <div class="cart-item-total-row">
            Total : <strong class="cart-item-val">£${itemTotal.toFixed(2)}</strong>
          </div>
        </div>
        <button type="button" class="cart-remove-btn" data-index="${idx}" aria-label="Remove item" title="Remove item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;
  }).join("");

  itemsList.querySelectorAll(".cart-remove-btn").forEach(btn => {
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

  if (summarySubtotal) summarySubtotal.textContent = `£${subtotal.toFixed(2)}`;
  if (summaryDiscount) summaryDiscount.textContent = discount > 0 ? `-£${discount.toFixed(2)}` : "£0.00";
  if (summaryTotal) summaryTotal.textContent = `£${finalTotal.toFixed(2)}`;
}

function updateCheckoutButtonText() {
  const btn = document.querySelector("#checkoutSubmitBtn");
  if (!btn) return;
  if (!currentUser) {
    btn.textContent = "Log in to Checkout →";
    return;
  }
  if (selectedPaymentMethod === "balance") {
    btn.textContent = "Buy with Balance";
  } else if (selectedPaymentMethod === "crypto") {
    const coinUpper = String(selectedCoin || "BTC").toUpperCase();
    const netUpper = selectedNetwork ? ` (${selectedNetwork.toUpperCase()})` : "";
    btn.textContent = `Pay with ${coinUpper}${netUpper}`;
  } else {
    btn.textContent = "Proceed to Payment";
  }
}

// Payment method selection & Network chips
document.querySelectorAll(".payment-method-card").forEach(card => {
  card.addEventListener("click", (e) => {
    // If clicked on a network chip inside the card
    const chip = e.target.closest(".network-chip");
    if (chip) {
      const chipParent = chip.parentElement;
      chipParent.querySelectorAll(".network-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      selectedNetwork = chip.dataset.network;
    }

    document.querySelectorAll(".payment-method-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    selectedPaymentMethod = card.dataset.method;
    if (card.dataset.coin) {
      selectedCoin = card.dataset.coin;
      if (card.dataset.coin === "usdt" && !selectedNetwork) selectedNetwork = "trc20";
      if (card.dataset.coin === "usdc" && !selectedNetwork) selectedNetwork = "erc20";
      if (card.dataset.coin !== "usdt" && card.dataset.coin !== "usdc") selectedNetwork = null;
    }
    updateCheckoutButtonText();
  });
});

// Crypto Live Search Filter
const cryptoSearchInput = document.querySelector("#cryptoSearch");
if (cryptoSearchInput) {
  cryptoSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    document.querySelectorAll(".payment-method-card[data-method='crypto']").forEach(card => {
      const searchTerms = (card.dataset.coinSearch || "").toLowerCase();
      if (!query || searchTerms.includes(query)) {
        card.style.display = "flex";
      } else {
        card.style.display = "none";
      }
    });
  });
}

// Apply Coupon
const applyCouponBtn = document.querySelector("#applyCouponBtn");
const couponCodeInput = document.querySelector("#couponCodeInput");
const couponStatusText = document.querySelector("#couponStatusText");

if (applyCouponBtn && couponCodeInput) {
  applyCouponBtn.addEventListener("click", async () => {
    const code = couponCodeInput.value.trim().toUpperCase();
    if (!code) return;

    const subtotal = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);

    applyCouponBtn.disabled = true;
    applyCouponBtn.textContent = "Verifying...";

    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, total: subtotal })
      });
      const data = await res.json();
      
      applyCouponBtn.disabled = false;
      applyCouponBtn.textContent = "Apply";

      if (res.ok && data.valid) {
        appliedCoupon = {
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discountAmount: data.discountAmount
        };
        
        const discLabel = data.discountType === "PERCENT" ? `${data.discountValue}% OFF` : `£${Number(data.discountValue).toFixed(2)} OFF`;
        if (couponStatusText) {
          couponStatusText.textContent = `✓ Coupon "${data.code}" applied (${discLabel})`;
          couponStatusText.style.color = "#4ade80";
        }
        
        if (typeof showMysterioAlert === "function") {
          showMysterioAlert({ message: `Coupon "${data.code}" applied (${discLabel})!`, title: "Coupon Applied", isError: false });
        }
        renderCart();
      } else {
        appliedCoupon = null;
        if (couponStatusText) {
          couponStatusText.textContent = data.error || "Invalid or expired coupon code.";
          couponStatusText.style.color = "#f87171";
        }
        if (typeof showMysterioAlert === "function") {
          showMysterioAlert({ message: data.error || "Invalid or expired coupon code.", title: "Coupon Error", isError: true });
        }
        renderCart();
      }
    } catch (e) {
      applyCouponBtn.disabled = false;
      applyCouponBtn.textContent = "Apply";
      if (couponStatusText) {
        couponStatusText.textContent = "Error verifying coupon code.";
        couponStatusText.style.color = "#f87171";
      }
    }
  });
}

// Checkout Submit
const checkoutSubmitBtn = document.querySelector("#checkoutSubmitBtn");
if (checkoutSubmitBtn) {
  checkoutSubmitBtn.addEventListener("click", async () => {
    if (cart.length === 0) {
      showMysterioAlert({ message: "Your cart is empty.", title: "Cart Empty", isError: true });
      return;
    }

    if (!currentUser) {
      showMysterioAlert({ message: "Please log in or create an account before checking out.", title: "Login Required", isError: true });
      setTimeout(() => window.location.href = "/login.html?redirect=/cart.html", 1200);
      return;
    }

    const emailInput = document.querySelector("#checkoutEmailInput");
    const email = emailInput ? emailInput.value.trim() : "";

    checkoutSubmitBtn.disabled = true;
    checkoutSubmitBtn.innerHTML = `<span class="btn-loading-spinner"></span> Processing...`;

    try {
      const payload = {
        items: cart,
        paymentMethod: selectedPaymentMethod,
        coin: selectedCoin,
        network: selectedNetwork,
        email: email,
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

        if (data.nowpayments) {
          sessionStorage.setItem("active_crypto_payment", JSON.stringify(data.nowpayments));
          window.location.href = `/pay.html?paymentId=${data.nowpayments.payment_id}&orderId=${data.orderId || ''}`;
        } else if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else if (data.orderId) {
          window.location.href = `/orders.html?orderId=${data.orderId}`;
        } else {
          window.location.href = "/orders.html";
        }
      } else {
        if (res.status === 401) {
          showMysterioAlert({ title: "Login Required", message: "Please sign in to complete your purchase.", isError: true });
          setTimeout(() => window.location.href = "/login.html", 1500);
          return;
        }

        // If it's a NOWPayments minimum amount error
        if (data.code === "AMOUNT_MINIMAL_ERROR" || (data.error && data.error.includes("minimal"))) {
          data.isMinimalError = true;
        }

        showMysterioAlert({
          title: data.isMinimalError ? "Minimum Amount Required" : (data.title || "Checkout Notice"),
          message: data.error || data.message || "Failed to process checkout.",
          error: data.error,
          isMinimalError: data.isMinimalError,
          usdMin: data.usdMin,
          cryptoMin: data.cryptoMin,
          coinSymbol: data.coinSymbol,
          currentAmountUsd: data.currentAmountUsd,
          isError: true
        });
      }
    } catch (e) {
      showMysterioAlert({ message: e.message || "Network error during checkout. Please try again.", title: "Checkout Error", isError: true });
    } finally {
      checkoutSubmitBtn.disabled = false;
      updateCheckoutButtonText();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadCart();
  fetchUserStatus();
  renderCart();
  syncCartWithLiveProducts();
  updateCheckoutButtonText();
  if (typeof window.updateCartBadge === "function") window.updateCartBadge();
});
