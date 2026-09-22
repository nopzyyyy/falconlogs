// Balance & Topup charge logic for 1:1 authed.cc architecture

document.addEventListener('DOMContentLoaded', () => {
  const chargeBtn = document.getElementById('btnChargeAccount');
  const amountInput = document.getElementById('inputChargeAmount');

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
    });
  }
});
