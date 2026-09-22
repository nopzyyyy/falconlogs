// Balance & Topup charge logic for 1:1 authed.cc architecture

document.addEventListener('DOMContentLoaded', () => {
  const chargeBtn = document.getElementById('btnChargeAccount');
  const amountInput = document.getElementById('inputChargeAmount');
  const processorEls = document.querySelectorAll('.paymentProcessor');
  const starsHint = document.getElementById('starsTotalHint');
  let selectedMethod = 'crypto';

  // Highlight default
  processorEls.forEach(el => {
    if (el.classList.contains('selected')) {
      selectedMethod = el.dataset.paymentprocessor || 'crypto';
    }
    el.addEventListener('click', () => {
      processorEls.forEach(p => p.classList.remove('selected'));
      el.classList.add('selected');
      selectedMethod = el.dataset.paymentprocessor || 'crypto';

      if (selectedMethod === 'stars' || selectedMethod === 'applepay') {
        updateStarsHint();
      } else if (starsHint) {
        starsHint.classList.add('d-none');
      }
    });
  });

  function updateStarsHint() {
    if (!starsHint || !amountInput) return;
    const amt = parseFloat(amountInput.value) || 0;
    if (amt > 0) {
      const stars = Math.round(amt * (window.STARS_PER_UNIT || 77));
      starsHint.textContent = Approx.  Telegram Stars;
      starsHint.classList.remove('d-none');
    } else {
      starsHint.classList.add('d-none');
    }
  }

  if (amountInput) {
    amountInput.addEventListener('input', () => {
      if (selectedMethod === 'stars' || selectedMethod === 'applepay') {
        updateStarsHint();
      }
    });
  }

  if (chargeBtn) {
    chargeBtn.addEventListener('click', async () => {
      const amt = parseFloat(amountInput ? amountInput.value : 0);
      if (isNaN(amt) || amt < 0.50) {
        if (typeof showToast === 'function') {
          showToast('Please enter an amount of at least £0.50', 'error');
        } else {
          alert('Please enter an amount of at least £0.50');
        }
        if (amountInput) amountInput.focus();
        return;
      }

      if (selectedMethod === 'crypto') {
        if (typeof CryptoFlow !== 'undefined' && CryptoFlow.open) {
          try {
            await CryptoFlow.open({
              mode: 'balance',
              amount: amt,
              onPaid: () => {
                window.location.reload();
              }
            });
          } catch (err) {
            if (typeof showToast === 'function') {
              showToast(err.message || 'Could not open crypto checkout', 'error');
            } else {
              alert(err.message || 'Could not open crypto checkout');
            }
          }
        } else {
          alert('Crypto checkout is currently initializing. Please try again.');
        }
      } else {
        // Stars or other payment processors
        try {
          chargeBtn.disabled = true;
          const res = await fetch('/api/balance/charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: amt,
              paymentMethod: selectedMethod
            })
          });
          const data = await res.json();
          if (data.botUrl) {
            window.open(data.botUrl, '_blank');
          } else if (data.payUrl) {
            window.location.href = data.payUrl;
          } else {
            if (typeof showToast === 'function') {
              showToast(data.message || 'Payment initiated', 'success');
            } else {
              alert(data.message || 'Payment initiated');
            }
          }
        } catch (err) {
          if (typeof showToast === 'function') {
            showToast(err.message || 'Payment request failed', 'error');
          } else {
            alert(err.message || 'Payment request failed');
          }
        } finally {
          chargeBtn.disabled = false;
        }
      }
    });
  }
});
