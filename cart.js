let cart = [];
let selectedPaymentMethod = "crypto";
let selectedCoin = null;
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
  if (typeof window.getCart === "function") {
    cart = window.getCart();
  } else {
    try {
      const expiresAt = Number(localStorage.getItem("mysterio_cart_expires_at") || 0);
      if (expiresAt && Date.now() > expiresAt) {
        localStorage.removeItem("mysterio_cart");
        localStorage.removeItem("mysterio_cart_expires_at");
        cart = [];
      } else {
        cart = JSON.parse(localStorage.getItem("mysterio_cart") || "[]");
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
      localStorage.removeItem("mysterio_cart");
      localStorage.removeItem("mysterio_cart_expires_at");
    } else {
      localStorage.setItem("mysterio_cart", JSON.stringify(cart));
      localStorage.setItem("mysterio_cart_expires_at", String(Date.now() + 15 * 60 * 1000));
    }
    if (typeof window.updateCartBadge === "function") window.updateCartBadge();
  }
}

// Silently re-render if cart expires while on the cart page
window.addEventListener("cart:expired", () => {
  cart = [];
  renderCart();
});

setInterval(() => {
  if (cart && cart.length > 0) {
    const expiresAt = Number(localStorage.getItem("mysterio_cart_expires_at") || 0);
    if (expiresAt && Date.now() > expiresAt) {
      cart = [];
      localStorage.removeItem("mysterio_cart");
      localStorage.removeItem("mysterio_cart_expires_at");
      if (typeof window.updateCartBadge === "function") window.updateCartBadge();
      renderCart();
    }
  }
}, 2500);

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

const COIN_META = {
  btc: { name: "Bitcoin", ticker: "BTC", icon: "/icons/btc.svg", desc: "BTC · ~30 min" },
  ltc: { name: "Litecoin", ticker: "LTC", icon: "/icons/ltc.svg", desc: "LTC · ~5 min · Low Fee" },
  sol: { name: "Solana", ticker: "SOL", icon: "/icons/sol.svg", desc: "SOL · Instant" },
  usdt: { name: "Tether USD", ticker: "USDT", icon: "/icons/usdt.svg", desc: "USDT · TRC20 / ERC20 / SOL" },
  usdc: { name: "USD Coin", ticker: "USDC", icon: "/icons/usdc.svg", desc: "USDC · ERC20 / SOL" },
  eth: { name: "Ethereum", ticker: "ETH", icon: "/icons/eth.svg", desc: "ETH · ~3 min" },
  trx: { name: "Tron", ticker: "TRX", icon: "/icons/trx.svg", desc: "TRX · Instant" }
};

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
    itemsList.innerHTML = `
      <div style="text-align:center; padding: 36px 16px; color: var(--muted); font-weight:600; display:flex; flex-direction:column; align-items:center; gap:12px;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg>
        <div style="color:rgba(255,255,255,0.7); font-size:14px;">Your shopping cart is currently empty.</div>
        <a href="/" style="background:#ea580c; color:#fff; text-decoration:none; padding:8px 18px; border-radius:6px; font-size:12.5px; font-weight:700; margin-top:4px;">Browse Products &rarr;</a>
      </div>
    `;
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
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="cart-item-thumb">` : `<div class="cart-item-thumb">${escapeHtml(String(item.name).slice(0, 2).toUpperCase())}</div>`}
        <div class="cart-item-details">
          <span class="cart-item-name">${escapeHtml(item.name)}</span>
          <div class="cart-item-variant">${escapeHtml(formattedVarName)}</div>
          <div class="cart-item-meta-row">
            <span class="cart-item-qty-badge">QTY: ${item.quantity || 1}</span>
            <span class="cart-item-unit-price">£${Number(item.price).toFixed(2)} each</span>
          </div>
        </div>
        <div class="cart-item-right">
          <button type="button" class="cart-remove-btn" data-index="${idx}" aria-label="Remove item" title="Remove item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
          <span class="cart-item-total">£${itemTotal.toFixed(2)}</span>
        </div>
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

function updateSelectedCoinDisplay() {
  const iconEl = document.querySelector("#selectedCoinIcon");
  const titleEl = document.querySelector("#selectedCoinTitle");
  const subEl = document.querySelector("#selectedCoinSub");
  const btnText = document.querySelector("#changeCoinBtnText");

  if (!selectedCoin) {
    if (iconEl) iconEl.src = "/icons/crypto.svg";
    if (titleEl) titleEl.textContent = "Cryptocurrency";
    if (subEl) subEl.textContent = "Choose coin & network";
    if (btnText) btnText.textContent = "Select Coin";
    return;
  }

  const meta = COIN_META[selectedCoin] || COIN_META.btc;
  if (iconEl) iconEl.src = meta.icon;
  if (titleEl) titleEl.textContent = `Pay with ${meta.name}`;
  if (btnText) btnText.textContent = "Change";
  if (subEl) {
    let networkText = "";
    if ((selectedCoin === "usdt" || selectedCoin === "usdc") && selectedNetwork) {
      networkText = ` · ${selectedNetwork.toUpperCase()}`;
    }
    subEl.textContent = `${meta.ticker}${networkText}`;
  }
}

function updateCheckoutButtonText() {
  const btn = document.querySelector("#checkoutSubmitBtn");
  if (!btn) return;
  if (!currentUser) {
    btn.textContent = "Log in to Checkout →";
    return;
  }
  if (selectedPaymentMethod === "balance") {
    btn.textContent = "Buy with Store Balance";
  } else if (selectedPaymentMethod === "crypto") {
    if (!selectedCoin) {
      btn.textContent = "Select Coin & Pay →";
    } else {
      const meta = COIN_META[selectedCoin] || COIN_META.btc;
      const netUpper = selectedNetwork ? ` (${selectedNetwork.toUpperCase()})` : "";
      btn.textContent = `Pay with ${meta.name}${netUpper}`;
    }
  } else {
    btn.textContent = "Proceed to Payment";
  }
}

function setPaymentMethod(method) {
  selectedPaymentMethod = method;
  const balanceChoice = document.querySelector("#choiceMethodBalance");
  const cryptoChoice = document.querySelector("#choiceMethodCrypto");

  if (balanceChoice && cryptoChoice) {
    if (method === "balance") {
      balanceChoice.classList.add("active");
      cryptoChoice.classList.remove("active");
      closeCoinsDrawer();
    } else {
      cryptoChoice.classList.add("active");
      balanceChoice.classList.remove("active");
    }
  }
  updateCheckoutButtonText();
}

// Drawer Controls (Inline Expandable Drawer)
function openCoinsDrawer() {
  const drawer = document.querySelector("#cryptoDrawer");
  const changeBtn = document.querySelector("#openCoinsDrawerBtn");
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
  if (changeBtn) {
    changeBtn.classList.add("open");
  }
  const searchInput = document.querySelector("#cryptoSearch");
  if (searchInput) {
    searchInput.value = "";
    document.querySelectorAll(".drawer-coin-card").forEach(c => c.style.display = "flex");
  }
}

function closeCoinsDrawer() {
  const drawer = document.querySelector("#cryptoDrawer");
  const changeBtn = document.querySelector("#openCoinsDrawerBtn");
  if (drawer) {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  if (changeBtn) {
    changeBtn.classList.remove("open");
  }
}

function toggleCoinsDrawer() {
  const drawer = document.querySelector("#cryptoDrawer");
  if (drawer && drawer.classList.contains("open")) {
    closeCoinsDrawer();
  } else {
    openCoinsDrawer();
  }
}

// Method selection choices
const choiceBalance = document.querySelector("#choiceMethodBalance");
if (choiceBalance) {
  choiceBalance.addEventListener("click", () => setPaymentMethod("balance"));
}

const openCoinsBtn = document.querySelector("#openCoinsDrawerBtn");
if (openCoinsBtn) {
  openCoinsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPaymentMethod("crypto");
    toggleCoinsDrawer();
  });
}

const choiceCrypto = document.querySelector("#choiceMethodCrypto");
if (choiceCrypto) {
  choiceCrypto.addEventListener("click", (e) => {
    if (e.target.closest("#openCoinsDrawerBtn")) return;
    setPaymentMethod("crypto");
    if (!selectedCoin) {
      openCoinsDrawer();
    } else {
      toggleCoinsDrawer();
    }
  });
}

const closeDrawerBtn = document.querySelector("#closeCryptoDrawerBtn");
if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeCoinsDrawer);

const drawerBackdrop = document.querySelector("#cryptoDrawerBackdrop");
if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeCoinsDrawer);

const confirmCoinBtn = document.querySelector("#confirmCoinSelectionBtn");
if (confirmCoinBtn) confirmCoinBtn.addEventListener("click", closeCoinsDrawer);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCoinsDrawer();
});

// Coin selection in drawer
document.querySelectorAll(".drawer-coin-card").forEach(card => {
  card.addEventListener("click", (e) => {
    const chip = e.target.closest(".network-chip");
    if (chip) {
      const chipParent = chip.parentElement;
      chipParent.querySelectorAll(".network-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      selectedNetwork = chip.dataset.network;
    }

    document.querySelectorAll(".drawer-coin-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    selectedPaymentMethod = "crypto";
    selectedCoin = card.dataset.coin || "btc";

    if (selectedCoin === "usdt" && !selectedNetwork) selectedNetwork = "trc20";
    if (selectedCoin === "usdc" && !selectedNetwork) selectedNetwork = "erc20";
    if (selectedCoin !== "usdt" && selectedCoin !== "usdc") selectedNetwork = null;

    setPaymentMethod("crypto");
    updateSelectedCoinDisplay();
    updateCheckoutButtonText();

    setTimeout(closeCoinsDrawer, 220);
  });
});

// Live Coin Search Filter in Drawer
const cryptoSearchInput = document.querySelector("#cryptoSearch");
if (cryptoSearchInput) {
  cryptoSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    document.querySelectorAll(".drawer-coin-card").forEach(card => {
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

    if (selectedPaymentMethod === "crypto" && !selectedCoin) {
      openCoinsDrawer();
      const drawer = document.querySelector("#cryptoDrawer");
      if (drawer) drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (typeof showMysterioAlert === "function") {
        showMysterioAlert({ message: "Please select a cryptocurrency and network to proceed.", title: "Select Coin", isError: false });
      }
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
  updateSelectedCoinDisplay();
  updateCheckoutButtonText();
  if (typeof window.updateCartBadge === "function") window.updateCartBadge();
});
