// Unlisted direct payment page at /pay (not linked in nav)

let selectedCurrency = 'GBP';
let selectedSign = '£';

function getPayAmount() {
  return parseFloat(document.getElementById('payAmountInput')?.value);
}

function updatePayUi() {
  const amount = getPayAmount();
  const hint = document.getElementById('payTotalHint');
  const btn = document.getElementById('btnPayContinue');
  const input = document.getElementById('payAmountInput');

  if (input) input.placeholder = `Enter amount in ${selectedSign}`;

  if (hint) hint.hidden = true;

  if (btn) {
    if (amount >= 0.5) {
      btn.textContent = `Pay ${selectedSign}${amount.toFixed(2)} with Crypto`;
    } else {
      btn.textContent = 'Continue to select coin';
    }
  }
}

function initPayLink() {
  document.querySelectorAll('#payCurrencyPicker .paymentProcessor').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#payCurrencyPicker .paymentProcessor').forEach((p) => p.classList.remove('selected'));
      el.classList.add('selected');
      selectedCurrency = el.dataset.currency || 'GBP';
      selectedSign = el.dataset.sign || '£';
      PAY_CURRENCY = selectedCurrency;
      PAY_CURRENCY_SIGN = selectedSign;
      updatePayUi();
    });
  });

  document.getElementById('payAmountInput')?.addEventListener('input', updatePayUi);

  document.getElementById('btnPayContinue')?.addEventListener('click', async () => {
    const amount = getPayAmount();
    if (!amount || amount < 0.5) {
      showToast(`Enter at least ${selectedSign}0.50`, 'error');
      document.getElementById('payAmountInput')?.focus();
      return;
    }

    if (typeof CryptoFlow === 'undefined' || !CryptoFlow.open) {
      showToast('Payment form is still loading. Try again in a moment.', 'error');
      return;
    }

    try {
      await CryptoFlow.open({
        mode: 'direct',
        amount,
        total: amount,
        currency: selectedCurrency,
        currencySign: selectedSign,
      });
    } catch (err) {
      showToast(err.message || 'Could not open payment', 'error');
    }
  });

  updatePayUi();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPayLink);
} else {
  initPayLink();
}
