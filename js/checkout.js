// ── Checkout page ──────────────────────────────────────────────────────────────

let cartItems = [];
let selectedProcessor = null;
let appliedCoupon = null;
let appliedDiscount = 0;

function isStarsPayment(method) {
  return method === 'stars' || method === 'applepay';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getCheckoutTotal() {
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = selectedProcessor === 'crypto' ? (TAX_PERCENT / 100) : 0;
  const taxAmount = (subtotal - appliedDiscount) * tax;
  return Math.max(0, subtotal - appliedDiscount + taxAmount);
}

function openCryptoCheckout() {
  if (!cartItems.length) {
    showToast('Your cart is empty', 'error');
    return;
  }
  CryptoFlow.open({
    mode: 'purchase',
    total: getCheckoutTotal(),
    couponCode: appliedCoupon,
    onPaid: () => {
      cartItems = [];
      updateTotals();
      updateCartCount();
    },
  });
}

async function loadCart() {
  const area = document.getElementById('cartItemsArea');
  try {
    const d = await apiFetch('/api/cart');
    cartItems = d.items;

    if (!cartItems.length) {
      area.innerHTML = `<div class="text-center py-4" style="color:rgba(255,255,255,.5)">Your cart is empty. <a href="/products" class="text-primary">Shop now</a></div>`;
      updateTotals();
      return;
    }

    area.innerHTML = cartItems.map(item => {
      const cartKey = item.stock_file_id ? `${item.option_id}:${item.stock_file_id}` : item.option_id;
      return `
      <div class="item w-100" id="cart-item-${cartKey.replace(/:/g, '-')}" data-cart-key="${cartKey}">
        <div class="w-100 d-flex justify-content-start align-items-center mt-1">
          ${item.image_url ? `<img class="img me-2 ms-1" src="${escHtml(item.image_url)}" alt="">` : `<div class="img me-2 ms-1" style="background:#2e2e2e;border-radius:6px"></div>`}
          <div class="d-flex flex-column justify-content-center align-items-baseline w-100">
            <div class="d-flex justify-content-between w-100">
              <h6 class="mb-0 me-2 text-white d-flex justify-content-center align-items-center">${escHtml(item.product_title)}</h6>
              <button onclick="removeCartItem('${cartKey}')" class="btn remove-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="16" viewBox="0 0 15 16" fill="none">
                  <path d="M5.06719 5.11124V3.81078C5.06719 3.52858 5.17395 3.25795 5.36399 3.05841C5.55403 2.85887 5.81178 2.74677 6.08054 2.74677H8.10723C8.37598 2.74677 8.63373 2.85887 8.82377 3.05841C9.01381 3.25795 9.12057 3.52858 9.12057 3.81078V5.11124M11.2317 5.11124L10.6406 12.3229C10.6406 12.6051 10.5338 12.8757 10.3438 13.0752C10.1537 13.2748 9.896 13.3869 9.62725 13.3869H4.56052C4.29176 13.3869 4.03401 13.2748 3.84397 13.0752C3.65394 12.8757 3.54717 12.6051 3.54717 12.3229L2.95605 5.11124H11.2317Z" stroke="#FF3850" stroke-width="1.18224" stroke-linecap="round" stroke-linejoin="round"></path>
                  <path d="M2.36475 5.11121H3.41562H11.8226" stroke="#FF3850" stroke-width="1.18224" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </button>
            </div>
            <label>${escHtml(item.option_name)}</label>
          </div>
        </div>
        <div class="w-100 d-flex justify-content-between mt-2">
          <div class="d-flex justify-content-start">
            <label class="fw-lighter me-3">Price : <label class="text-white fw-semibold">${CURRENCY_SIGN}${item.price.toFixed(2)}</label></label>
            <label class="fw-lighter">QTY : <label class="text-white fw-semibold">${item.quantity}</label></label>
          </div>
          <svg class="ms-2" xmlns="http://www.w3.org/2000/svg" width="2" height="26" viewBox="0 0 2 26" fill="none"><path opacity="0.25" d="M0.932373 0.426514V25.1937" stroke="white" stroke-width="0.687977"></path></svg>
          <label class="fw-lighter ms-2">Total : <label class="text-white fw-semibold">${CURRENCY_SIGN}${(item.price * item.quantity).toFixed(2)}</label></label>
        </div>
      </div>`;
    }).join('');

    updateTotals();
    document.getElementById('cartItemsCount').textContent = cartItems.reduce((s, i) => s + i.quantity, 0);
  } catch (err) {
    area.innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

async function removeCartItem(cartKey) {
  try {
    await apiFetch(`/api/cart/${encodeURIComponent(cartKey)}`, { method: 'DELETE' });
    cartItems = cartItems.filter(i => {
      const key = i.stock_file_id ? `${i.option_id}:${i.stock_file_id}` : i.option_id;
      return key !== cartKey;
    });
    document.getElementById(`cart-item-${cartKey.replace(/:/g, '-')}`)?.remove();
    updateTotals();
    updateCartCount();
    if (!cartItems.length) {
      document.getElementById('cartItemsArea').innerHTML = `<div class="text-center py-4" style="color:rgba(255,255,255,.5)">Your cart is empty. <a href="/products" class="text-primary">Shop now</a></div>`;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateTotals() {
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = selectedProcessor ? parseFloat(document.querySelector('.paymentProcessor.selected')?.dataset.tax || 0) : 0;
  const taxAmount = (subtotal - appliedDiscount) * tax / 100;
  const total = subtotal - appliedDiscount + taxAmount;

  document.getElementById('subTotalAmount').textContent = CURRENCY_SIGN + subtotal.toFixed(2);
  document.getElementById('discountAmount').textContent = CURRENCY_SIGN + appliedDiscount.toFixed(2);
  const totalFinal = Math.max(0, total);
  document.getElementById('totalAmount').textContent = CURRENCY_SIGN + totalFinal.toFixed(2);

  const starsHint = document.getElementById('starsTotalHint');
  if (starsHint && typeof STARS_PER_UNIT === 'number') {
    if (isStarsPayment(selectedProcessor) && totalFinal > 0) {
      const stars = Math.max(1, Math.ceil(totalFinal * STARS_PER_UNIT));
      starsHint.textContent = `You will pay ${stars} Telegram Stars`;
      starsHint.classList.remove('d-none');
    } else {
      starsHint.classList.add('d-none');
    }
  }

  const feeRow = document.getElementById('platformFeeRow');
  const feeAmt = document.getElementById('platformFeeAmount');
  if (feeRow && feeAmt) {
    if (tax > 0) {
      feeAmt.textContent = `+${tax * 100}% (${CURRENCY_SIGN}${taxAmount.toFixed(2)})`;
      feeRow.classList.remove('d-none');
    } else {
      feeRow.classList.add('d-none');
    }
  }

  const purchaseBtn = document.getElementById('btnCartPurchase');
  if (purchaseBtn && selectedProcessor === 'crypto') {
    purchaseBtn.textContent = `Pay ${CURRENCY_SIGN}${totalFinal.toFixed(2)} with Crypto`;
  } else if (purchaseBtn) {
    purchaseBtn.textContent = 'Purchase';
  }
}

// ── Payment processor selection ────────────────────────────────────────────────

document.querySelectorAll('.paymentProcessor').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.paymentProcessor').forEach(p => p.classList.remove('selected'));
    el.classList.add('selected');
    selectedProcessor = el.dataset.paymentprocessor;
    updateTotals();
    if (selectedProcessor === 'crypto') openCryptoCheckout();
  });
});

// ── Coupon ─────────────────────────────────────────────────────────────────────

document.getElementById('btnApplyCoupon')?.addEventListener('click', async () => {
  const code = document.getElementById('couponCode').value.trim();
  if (!code) return;
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const msg = document.getElementById('couponMessage');
  try {
    const d = await apiFetch('/api/coupons/apply', { method: 'POST', body: { code, subtotal } });
    appliedDiscount = d.discount;
    appliedCoupon = code;
    msg.textContent = `✓ Coupon applied! -${CURRENCY_SIGN}${d.discount.toFixed(2)}`;
    msg.style.color = '#00b027';
    updateTotals();
  } catch (err) {
    msg.textContent = '✗ ' + err.message;
    msg.style.color = '#dc3545';
  }
});

// ── Purchase ──────────────────────────────────────────────────────────────────

function setPurchaseModalCta({ href, label, show = true }) {
  const cta = document.getElementById('purchaseResultCta');
  if (!cta) return;
  if (!show) {
    cta.classList.add('d-none');
    return;
  }
  cta.classList.remove('d-none');
  cta.href = href;
  cta.textContent = label;
}

document.getElementById('btnCartPurchase')?.addEventListener('click', async () => {
  if (!cartItems.length) { showToast('Your cart is empty', 'error'); return; }
  const proc = document.querySelector('.paymentProcessor.selected');
  if (!proc) { showToast('Please select a payment method', 'error'); return; }

  if (proc.dataset.paymentprocessor === 'crypto') {
    openCryptoCheckout();
    return;
  }

  const btn = document.getElementById('btnCartPurchase');
  btn.textContent = 'Processing...';
  btn.disabled = true;

  setPurchaseModalCta({ href: '/dashboard/orders', label: 'View Orders', show: true });
  document.getElementById('purchaseResultTitle').textContent = 'Processing...';
  document.getElementById('purchaseResultBody').innerHTML = '<div class="loading"></div>';

  const modal = new bootstrap.Modal(document.getElementById('purchaseResultModal'));
  modal.show();

  try {
    const d = await apiFetch('/api/orders/purchase', {
      method: 'POST',
      body: { paymentMethod: proc.dataset.paymentprocessor, couponCode: appliedCoupon },
    });

    document.getElementById('purchaseResultTitle').textContent = 'Order Created!';

    if (d.invoiceLink) {
      setPurchaseModalCta({ show: false });
      document.getElementById('purchaseResultBody').innerHTML = `
        <p>Your order has been created. Pay with <strong>${d.starsAmount} Telegram Stars</strong> in the Telegram app.</p>
        <p><strong>Order ID:</strong> <code style="font-size:11px">${d.orderId}</code></p>
        <a href="${d.invoiceLink}" class="btn btn-primary w-100" target="_blank" rel="noopener">Pay with Telegram Stars</a>
        <p class="text-muted mt-2" style="font-size:12px">Opens in Telegram. Your order is fulfilled automatically after payment.</p>
      `;
    } else {
      setPurchaseModalCta({ href: '/dashboard/orders', label: 'View Orders', show: true });
      document.getElementById('purchaseResultBody').innerHTML = `
        <p class="text-success">✓ Order fulfilled successfully!</p>
        <p><strong>Order ID:</strong> <code style="font-size:11px">${d.orderId}</code></p>
        <p>Check your orders page to view delivered items.</p>
      `;
      cartItems = [];
      updateTotals();
      updateCartCount();
    }
  } catch (err) {
    const insufficientBalance = err.code === 'INSUFFICIENT_BALANCE'
      || /insufficient balance/i.test(err.message || '');
    document.getElementById('purchaseResultTitle').textContent = insufficientBalance ? 'Insufficient Balance' : 'Error';
    document.getElementById('purchaseResultBody').innerHTML = insufficientBalance
      ? `<p class="text-danger">You don't have enough balance to complete this purchase. Top up your account and try again.</p>`
      : `<p class="text-danger">${escHtml(err.message)}</p>`;
    if (insufficientBalance) {
      setPurchaseModalCta({ href: '/balance', label: 'Top Up Balance' });
    } else {
      setPurchaseModalCta({ show: false });
    }
  } finally {
    btn.textContent = selectedProcessor === 'crypto' ? `Pay ${CURRENCY_SIGN}${getCheckoutTotal().toFixed(2)} with Crypto` : 'Purchase';
    btn.disabled = false;
  }
});

loadCart();
