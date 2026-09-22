// Render payment QR from a wallet URI (fixes OxaPay QR missing decimal point).

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

async function renderPaymentQr(container, checkout) {
  if (!container) return;
  const paymentUri = checkout?.paymentUri;
  const fallback = checkout?.qrCode;

  container.innerHTML = '<div class="crypto-pay-qr-frame crypto-pay-qr-loading"><div class="loading"></div></div>';

  if (paymentUri && typeof QRCode !== 'undefined') {
    try {
      const frame = document.createElement('div');
      frame.className = 'crypto-pay-qr-frame';
      const canvas = document.createElement('canvas');
      canvas.className = 'crypto-pay-qr';
      frame.appendChild(canvas);
      container.innerHTML = '';
      container.appendChild(frame);
      await QRCode.toCanvas(canvas, paymentUri, {
        width: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      });
      return;
    } catch (_) { /* fall through to fallback */ }
  }

  if (fallback) {
    container.innerHTML = `
      <div class="crypto-pay-qr-frame">
        <img src="${escAttr(fallback)}" alt="Payment QR code" class="crypto-pay-qr">
      </div>`;
    return;
  }

  container.innerHTML = '';
}
