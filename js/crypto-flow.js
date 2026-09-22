// Full-screen crypto modal: coin picker → payment → done (single window).

function safeNavUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    if (s.startsWith('/') && !s.startsWith('//')) return s;
    return new URL(s).href;
  } catch (_) {
    return null;
  }
}

const CryptoFlow = (() => {
  let modalEl, bodyEl, titleEl, backBtn, footerEl, confirmBtn, bsModal;
  let ctx = null;
  let step = 'coins';
  let pollTimer = null;
  let countdownTimer = null;
  let expiredAt = null;
  let payUiReady = false;
  let payApiPath = null;
  let coins = [];
  let coinFilter = '';
  let selectedCoinKey = null;

  function stopTimers() {
    if (pollTimer) clearInterval(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
  }

  function formatCryptoAmount(amount, currency) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return String(amount ?? '');
    const decimals = ['BTC', 'ETH', 'LTC', 'BNB', 'BCH', 'DOGE'].includes(String(currency || '').toUpperCase()) ? 8 : 6;
    let s = n.toFixed(decimals);
    s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    if (s.startsWith('.')) s = `0${s}`;
    return s;
  }

  function exactPayAmount(checkout, currency) {
    if (checkout?.payAmountExact) return checkout.payAmountExact;
    return formatCryptoAmount(checkout?.payAmount, currency);
  }

  function formatCountdown(ts) {
    if (!ts) return '';
    const end = Number(ts) * (ts > 1e12 ? 1 : 1000);
    const diff = end - Date.now();
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
    return `${mins}m ${String(secs).padStart(2, '0')}s left`;
  }

  function statusMeta(status, txStatus, confirmations) {
    const s = String(status || '').toLowerCase();
    if (s === 'underpaid') {
      return { label: 'Underpaid. Processing', tone: 'warning', step: 3 };
    }
    if (s === 'paid' || s === 'completed' || s === 'confirmed') {
      return { label: 'Payment confirmed', tone: 'success', step: 3 };
    }
    if (s === 'expired') return { label: 'Payment expired', tone: 'danger', step: 0 };
    if (s === 'paying' || s === 'confirming' || txStatus === 'confirming') {
      const conf = confirmations != null ? ` · ${confirmations} conf.` : '';
      return { label: `Confirming${conf}`, tone: 'warning', step: 2 };
    }
    return { label: 'Waiting for payment', tone: 'muted', step: 1 };
  }

  function progressHtml(n) {
    return [1, 2, 3].map((i) => {
      let cls = 'crypto-pay-progress-seg';
      if (n >= i) cls += n > i ? ' done' : ' active';
      return `<div class="${cls}"></div>`;
    }).join('');
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = prev; }, 1400);
      }
    } catch (_) { showToast?.('Could not copy', 'error'); }
  }

  function fiatAmount() {
    if (ctx?.mode === 'balance' || ctx?.mode === 'direct') return Number(ctx.amount);
    return Number(ctx.total);
  }

  function activeCurrencySign() {
    return ctx?.currencySign || (typeof PAY_CURRENCY_SIGN !== 'undefined' ? PAY_CURRENCY_SIGN : null) || (typeof CURRENCY_SIGN !== 'undefined' ? CURRENCY_SIGN : null) || '£';
  }

  function confirmFiatTotal() {
    const amt = fiatAmount();
    if (!Number.isFinite(amt)) return amt;
    if (ctx?.mode === 'direct') return amt;
    if (ctx?.mode === 'balance') {
      const tax = typeof TAX_PERCENT === 'number' ? TAX_PERCENT : 0;
      return amt * (1 + tax / 100);
    }
    return Number(ctx?.total ?? amt);
  }

  function setFlowStep(n, label) {
    const stepLabel = document.getElementById('cryptoFlowStepLabel');
    const dots = document.querySelectorAll('#cryptoFlowSteps .crypto-flow-step-dot');
    if (stepLabel) stepLabel.textContent = label || `Step ${n} of 3`;
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i + 1 === n);
      dot.classList.toggle('done', i + 1 < n);
    });
  }

  function setHeader({ title, showBack, flowStep, flowLabel }) {
    if (titleEl) titleEl.textContent = title;
    backBtn?.classList.toggle('d-none', !showBack);
    if (flowStep != null) setFlowStep(flowStep, flowLabel);
  }

  function setFooterVisible(visible) {
    footerEl?.classList.toggle('d-none', !visible);
  }

  function updateConfirmButton() {
    if (!confirmBtn) return;
    const match = selectedCoinKey
      ? coins.find((c) => `${c.currency}|${c.network || ''}` === selectedCoinKey)
      : null;
    confirmBtn.disabled = !match;
    const total = confirmFiatTotal();
    confirmBtn.textContent = match && Number.isFinite(total)
      ? `Confirm Selection · ${activeCurrencySign()}${total.toFixed(2)}`
      : 'Confirm Selection';
  }

  function renderCoinsStep() {
    step = 'coins';
    payUiReady = false;
    stopTimers();
    setHeader({ title: 'Select cryptocurrency', showBack: false, flowStep: 1, flowLabel: 'Step 1 of 3 · Choose coin' });
    setFooterVisible(true);
    updateConfirmButton();

    bodyEl.innerHTML = `
      <div class="crypto-flow-step crypto-flow-step-enter">
        <div class="crypto-flow-search-wrap">
          <svg class="crypto-flow-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M20 20l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input type="text" class="crypto-flow-search-input" id="cryptoFlowSearch" placeholder="Search coins…" autocomplete="off" inputmode="search" value="${escHtml(coinFilter)}">
        </div>
        <div class="crypto-flow-grid-wrap">
          <div class="crypto-picker-grid crypto-flow-grid" id="cryptoFlowGrid"></div>
        </div>
      </div>`;

    document.getElementById('cryptoFlowSearch')?.addEventListener('input', (e) => {
      coinFilter = e.target.value;
      paintCoinGrid();
    });
    paintCoinGrid();
  }

  function paintCoinGrid() {
    const grid = document.getElementById('cryptoFlowGrid');
    if (!grid) return;
    const q = coinFilter.trim().toLowerCase();
    const visible = coins.filter((c) => {
      if (!q) return true;
      const name = coinDisplayName(c.currency);
      return `${c.currency} ${c.network || ''} ${c.label || ''} ${name}`.toLowerCase().includes(q);
    });
    if (selectedCoinKey && !visible.some((c) => `${c.currency}|${c.network || ''}` === selectedCoinKey)) {
      selectedCoinKey = null;
      updateConfirmButton();
    }
    if (!visible.length) {
      grid.innerHTML = `<div class="crypto-picker-empty">No coins match your search</div>`;
      return;
    }
    const amt = fiatAmount();
    grid.innerHTML = visible.map((c, i) => renderCoinCardHtml(c, i, selectedCoinKey, confirmFiatTotal(), activeCurrencySign())).join('');
    grid.querySelectorAll('.crypto-coin-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCoinKey = `${btn.dataset.currency}|${btn.dataset.network || ''}`;
        paintCoinGrid();
        updateConfirmButton();
      });
    });
  }

  async function confirmCoinSelection() {
    if (!selectedCoinKey) return;
    const [currency, networkRaw] = selectedCoinKey.split('|');
    await onCoinPicked(currency, networkRaw || null);
  }

  async function onCoinPicked(currency, network) {
    const match = coins.find((c) => c.currency === currency && (c.network || null) === (network || null));
    if (!match) return;

    step = 'creating';
    setFooterVisible(false);
    setHeader({ title: 'Creating payment…', showBack: false, flowStep: 2, flowLabel: 'Step 2 of 3 · Setting up' });
    bodyEl.innerHTML = `
      <div class="crypto-flow-loading">
        <div class="crypto-picker-spinner"></div>
        <p>Setting up your ${escHtml(match.label || currency)} payment…</p>
      </div>`;

    try {
      let payUrl;
      if (ctx.mode === 'purchase') {
        const d = await apiFetch('/api/orders/purchase', {
          method: 'POST',
          body: {
            paymentMethod: 'crypto',
            payCurrency: match.currency,
            network: match.network || null,
            couponCode: ctx.couponCode || null,
          },
        });
        if (!d.payUrl) throw new Error('Could not create payment');
        payUrl = safeNavUrl(d.payUrl);
        if (!payUrl) throw new Error('Invalid payment URL');
        ctx.orderId = d.orderId;
      } else if (ctx.mode === 'direct') {
        const d = await apiFetch('/api/pay/direct', {
          method: 'POST',
          body: {
            amount: ctx.amount,
            currency: ctx.currency || 'GBP',
            paymentMethod: 'crypto',
            payCurrency: match.currency,
            network: match.network || null,
          },
        });
        if (!d.payUrl) throw new Error('Could not create payment');
        payUrl = safeNavUrl(d.payUrl);
        if (!payUrl) throw new Error('Invalid payment URL');
      } else {
        const d = await apiFetch('/api/balance/charge', {
          method: 'POST',
          body: {
            amount: ctx.amount,
            paymentMethod: 'crypto',
            payCurrency: match.currency,
            network: match.network || null,
          },
        });
        if (!d.payUrl) throw new Error('Could not create payment');
        payUrl = safeNavUrl(d.payUrl);
        if (!payUrl) throw new Error('Invalid payment URL');
      }
      if (d && d.payApiPath) {
        payApiPath = d.payApiPath;
        showPayStep();
        return;
      }
      window.location.href = payUrl;
    } catch (err) {
      bodyEl.innerHTML = `
        <div class="crypto-flow-error">
          <p class="text-danger mb-3">${escHtml(err.message || 'Payment could not be created')}</p>
          <button type="button" class="btn btn-primary w-100" id="cryptoFlowRetry">Try again</button>
        </div>`;
      document.getElementById('cryptoFlowRetry')?.addEventListener('click', renderCoinsStep);
    }
  }

  function renderPayContent(data) {
    const checkout = data.checkout;
    if (!checkout?.address) {
      bodyEl.innerHTML = `<p class="text-danger text-center">Payment details unavailable.</p>`;
      return null;
    }

    const meta = statusMeta(data.status, data.txStatus, data.confirmations);
    const cur = String(checkout.payCurrency || '').toUpperCase();
    const coinLabel = [cur, checkout.network].filter(Boolean).join(' · ');
    const accent = oxCoinAccent(cur);
    const initials = cur.slice(0, 2);

    const sign = data.fiatCurrencySign || activeCurrencySign();
    const exactAmt = exactPayAmount(checkout, cur);
    const fiatLine = data.type === 'balance' && data.chargeAmount != null
      ? `<div class="crypto-pay-row"><span>Balance credit</span><strong>${sign}${Number(data.chargeAmount).toFixed(2)}</strong></div>
         <div class="crypto-pay-row"><span>You pay</span><strong>${sign}${Number(data.fiatAmount).toFixed(2)}</strong></div>`
      : data.type === 'direct'
        ? `<div class="crypto-pay-row"><span>Amount</span><strong>${sign}${Number(data.fiatAmount).toFixed(2)}</strong></div>`
      : `<div class="crypto-pay-row"><span>Order total</span><strong>${sign}${Number(data.fiatAmount).toFixed(2)}</strong></div>`;

    bodyEl.innerHTML = `
      <div class="crypto-flow-step crypto-flow-step-enter crypto-pay-in-modal">
        <div class="crypto-pay-hero">
          <div class="crypto-pay-hero-icon" style="--coin-accent:${accent}">
            <img src="${oxCoinIconUrl(cur)}" alt=""
              onerror="this.style.display='none';this.parentElement.classList.add('fallback');this.parentElement.textContent='${escHtml(initials)}'">
          </div>
          <div class="crypto-pay-hero-text">
            <h6>Send ${escHtml(cur)}</h6>
            <p>Copy and send the full amount below. We'll detect it automatically. Avoid Revolut crypto wallets.</p>
          </div>
        </div>
        <div class="crypto-pay-progress" id="cryptoFlowProgress">${progressHtml(meta.step)}</div>
        <div class="crypto-pay-status crypto-pay-status-${meta.tone}" id="cryptoFlowStatus">${escHtml(meta.label)}</div>
        <div class="crypto-pay-countdown" id="cryptoFlowCountdown"></div>
        <div class="crypto-pay-qr-wrap" id="cryptoFlowQrWrap"></div>
        <div class="crypto-pay-field mb-3">
          <label>Amount to send</label>
          <div class="crypto-pay-copy-row crypto-pay-copy-row--amount">
            <code id="cryptoFlowAmount">${escHtml(exactAmt)} ${escHtml(cur)}</code>
            <button type="button" class="crypto-pay-copy-btn" id="cryptoFlowCopyAmt">Copy</button>
          </div>
          <div class="crypto-pay-amount-sub mt-1">${escHtml(coinLabel)}</div>
        </div>
        <div class="crypto-pay-field mb-2">
          <label>Address</label>
          <div class="crypto-pay-copy-row">
            <code id="cryptoFlowAddress">${escHtml(checkout.address)}</code>
            <button type="button" class="crypto-pay-copy-btn" id="cryptoFlowCopyAddr">Copy</button>
          </div>
        </div>
        ${checkout.memo ? `
        <div class="crypto-pay-field mb-3">
          <label>Memo <span class="text-warning">(required)</span></label>
          <div class="crypto-pay-copy-row">
            <code id="cryptoFlowMemo">${escHtml(checkout.memo)}</code>
            <button type="button" class="crypto-pay-copy-btn" id="cryptoFlowCopyMemo">Copy</button>
          </div>
        </div>` : ''}
        <div class="crypto-pay-summary">${fiatLine}</div>
      </div>`;

    renderPaymentQr(document.getElementById('cryptoFlowQrWrap'), checkout);

    document.getElementById('cryptoFlowCopyAddr')?.addEventListener('click', (e) => copyText(checkout.address, e.currentTarget));
    document.getElementById('cryptoFlowCopyAmt')?.addEventListener('click', (e) => copyText(exactAmt, e.currentTarget));
    document.getElementById('cryptoFlowCopyMemo')?.addEventListener('click', (e) => copyText(checkout.memo, e.currentTarget));
    return checkout.expiredAt;
  }

  function updatePayStatus(data) {
    const meta = statusMeta(data.status, data.txStatus, data.confirmations);
    const statusEl = document.getElementById('cryptoFlowStatus');
    const progressEl = document.getElementById('cryptoFlowProgress');
    if (statusEl) {
      statusEl.className = `crypto-pay-status crypto-pay-status-${meta.tone}`;
      statusEl.textContent = meta.label;
    }
    if (progressEl) progressEl.innerHTML = progressHtml(meta.step);
  }

  function renderUnderpaid(data, redirect) {
    step = 'done';
    stopTimers();
    setFooterVisible(false);
    setHeader({ title: 'Payment underpaid', showBack: false, flowStep: 3, flowLabel: 'Step 3 of 3 · Underpaid' });

    const info = data?.underpaidInfo;
    const cur = info?.payCurrency || 'crypto';
    const pct = info?.shortfallPct != null ? `${info.shortfallPct}%` : 'a small amount';
    const sign = activeCurrencySign();
    const credited = data?.creditedAmount ?? (ctx?.mode === 'balance' ? ctx.amount : ctx?.total);
    const pending = data?.awaitingCredit !== false && data?.creditedFiat == null;
    const creditLine = pending && credited != null
      ? `We received ~<strong>${sign}${Number(credited).toFixed(2)}</strong> worth less than required. Your balance will be credited once the payment is confirmed. The order cannot be completed.`
      : credited != null
        ? `<strong>${sign}${Number(credited).toFixed(2)}</strong> has been credited to your balance for what you sent. The order could not be completed.`
        : 'You sent less than required. The order cannot be completed.';

    if (ctx?.mode === 'direct') {
      bodyEl.innerHTML = `
        <div class="crypto-pay-underpaid">
          <div class="crypto-pay-underpaid-ring">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="text-warning fw-semibold mb-1" style="font-size:18px">Payment underpaid</p>
          <p class="text-muted mb-2" style="font-size:13px">You sent slightly less than required (~${escHtml(pct)} short on ${escHtml(cur)}).</p>
          <p class="text-muted mb-0" style="font-size:13px">${creditLine}</p>
        </div>`;
      ctx.onPaid?.();
      return;
    }

    const href = safeNavUrl(redirect) || (ctx?.mode === 'balance' ? '/balance' : '/dashboard/orders');
    const label = href.includes('balance') ? 'Go to balance' : 'View orders';
    bodyEl.innerHTML = `
      <div class="crypto-pay-underpaid">
        <div class="crypto-pay-underpaid-ring">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p class="text-warning fw-semibold mb-1" style="font-size:18px">Payment underpaid</p>
        <p class="text-muted mb-2" style="font-size:13px">You sent slightly less than required (~${escHtml(pct)} short on ${escHtml(cur)}).</p>
        <p class="text-muted mb-4" style="font-size:13px">${creditLine}</p>
        <a href="${escHtml(href)}" class="btn btn-warning w-100">${escHtml(label)}</a>
      </div>`;
    ctx.onPaid?.();
  }

  function renderSuccess(redirect) {
    step = 'done';
    stopTimers();
    setFooterVisible(false);
    setHeader({ title: 'Payment confirmed', showBack: false, flowStep: 3, flowLabel: 'Step 3 of 3 · Complete' });

    if (ctx?.mode === 'direct') {
      bodyEl.innerHTML = `
        <div class="crypto-pay-success">
          <div class="crypto-pay-success-ring">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="text-success fw-semibold mb-1" style="font-size:18px">Payment confirmed</p>
          <p class="text-muted mb-2" style="font-size:13px">Your payment was received successfully.</p>
          <p class="text-muted mb-0" style="font-size:13px">We have notified the owner. Thank you for your payment.</p>
        </div>`;
      ctx.onPaid?.();
      return;
    }

    const href = safeNavUrl(redirect) || (ctx?.mode === 'balance' ? '/balance' : '/dashboard/orders');
    const label = href.includes('balance') ? 'Go to balance' : 'View orders';
    bodyEl.innerHTML = `
      <div class="crypto-pay-success">
        <div class="crypto-pay-success-ring">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l5 5L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p class="text-success fw-semibold mb-1" style="font-size:18px">Payment received</p>
        <p class="text-muted mb-4" style="font-size:13px">Your payment was received successfully.</p>
        <a href="${escHtml(href)}" class="btn btn-primary w-100">${escHtml(label)}</a>
      </div>`;
    ctx.onPaid?.();
  }

  let pollFailures = 0;

  async function pollPayment() {
    if (!payApiPath) return;
    try {
      const data = await apiFetch(payApiPath);
      pollFailures = 0;

      const legacyLink = safeNavUrl(data.legacyPayLink);
      if (legacyLink) { window.location.href = legacyLink; return; }
      if (data.underpaid) {
        const redirect = safeNavUrl(data.redirect) || (data.type === 'balance' ? '/balance' : '/dashboard/orders');
        renderUnderpaid(data, redirect);
        return;
      }
      if (data.paid) {
        const redirect = safeNavUrl(data.redirect) || (data.type === 'balance' ? '/balance' : '/dashboard/orders');
        renderSuccess(redirect);
        return;
      }
      if (!payUiReady) {
        expiredAt = renderPayContent(data) || data.expiredAt;
        payUiReady = true;
        setHeader({ title: 'Complete payment', showBack: false, flowStep: 2, flowLabel: 'Step 2 of 3 · Send payment' });
      } else {
        updatePayStatus(data);
        expiredAt = data.expiredAt || expiredAt;
      }
      const cd = document.getElementById('cryptoFlowCountdown');
      if (cd && expiredAt) cd.textContent = formatCountdown(expiredAt);
    } catch (err) {
      pollFailures += 1;
      if (payUiReady || pollFailures < 5) {
        console.warn('[crypto-flow] status poll failed:', err.message);
        return;
      }
      bodyEl.innerHTML = `<p class="text-danger text-center">Connection lost. Please refresh. Your payment may already be confirmed.</p>`;
      stopTimers();
    }
  }

  async function showPayStep() {
    step = 'pay';
    payUiReady = false;
    setFooterVisible(false);
    setHeader({ title: 'Loading payment…', showBack: false, flowStep: 2, flowLabel: 'Step 2 of 3 · Loading' });
    bodyEl.innerHTML = `<div class="crypto-flow-loading"><div class="crypto-picker-spinner"></div></div>`;
    await pollPayment();
    pollTimer = setInterval(pollPayment, 5000);
    countdownTimer = setInterval(() => {
      const cd = document.getElementById('cryptoFlowCountdown');
      if (cd && expiredAt) cd.textContent = formatCountdown(expiredAt);
    }, 1000);
  }

  async function open(options) {
    if (!modalEl) {
      init();
    }
    if (!modalEl) {
      throw new Error('Payment window could not load');
    }
    ctx = options;
    coinFilter = '';
    selectedCoinKey = null;
    payApiPath = null;
    step = 'coins';

    try {
      coins = await loadOxapayCurrencies();
    } catch (_) {
      showToast?.('Could not load coins', 'error');
      return;
    }
    if (!coins.length) {
      showToast?.('No cryptocurrencies available', 'error');
      return;
    }

    renderCoinsStep();
    bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
  }

  function init() {
    modalEl = document.getElementById('cryptoFlowModal');
    if (!modalEl) return;
    bodyEl = document.getElementById('cryptoFlowBody');
    titleEl = document.getElementById('cryptoFlowTitle');
    backBtn = document.getElementById('cryptoFlowBack');
    footerEl = document.getElementById('cryptoFlowFooter');
    confirmBtn = document.getElementById('cryptoFlowConfirm');

    confirmBtn?.addEventListener('click', confirmCoinSelection);

    backBtn?.addEventListener('click', () => {
      if (step === 'pay' && !payUiReady) renderCoinsStep();
      else if (step === 'pay') { /* don't go back mid-payment */ }
      else renderCoinsStep();
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
      stopTimers();
      ctx = null;
      payUiReady = false;
    });
  }

  return { init, open };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CryptoFlow.init());
} else {
  CryptoFlow.init();
}
